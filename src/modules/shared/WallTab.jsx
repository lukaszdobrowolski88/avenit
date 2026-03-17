import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Send, Image, Paperclip, Link as LinkIcon, X, Heart,
  Trash2, Download, ExternalLink, Pin, FileText, Reply, CornerDownRight
} from 'lucide-react';

export default function WallTab({ ministry, currentUserEmail, currentUserName }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [userAvatars, setUserAvatars] = useState({});
  const [replyingTo, setReplyingTo] = useState(null); // {id, author, content}
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const textInputRef = useRef(null);

  useEffect(() => {
    fetchPosts();
    fetchUserAvatars();
  }, [ministry]);

  useEffect(() => {
    scrollToBottom();
  }, [posts]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchUserAvatars = async () => {
    try {
      const { data } = await supabase
        .from('app_users')
        .select('email, full_name, avatar_url');

      if (data) {
        const avatarMap = {};
        data.forEach(user => {
          avatarMap[user.email] = {
            name: user.full_name,
            avatar: user.avatar_url
          };
        });
        setUserAvatars(avatarMap);
      }
    } catch (err) {
      console.error('Error fetching avatars:', err);
    }
  };

  const fetchPosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('wall_posts')
        .select('*')
        .eq('ministry', ministry)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPosts(data || []);
    } catch (err) {
      console.error('Error fetching posts:', err);
    }
    setLoading(false);
  };

  const handleFileUpload = async (e, type) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    try {
      const uploadedFiles = [];

      for (const file of files) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `wall_attachments/${ministry.replace(/\s+/g, '_')}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('public-assets')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('public-assets').getPublicUrl(filePath);

        uploadedFiles.push({
          type: type === 'image' ? 'image' : 'file',
          name: file.name,
          url: data.publicUrl,
          size: file.size
        });
      }

      setAttachments(prev => [...prev, ...uploadedFiles]);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Blad przesylania pliku: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const addLink = () => {
    if (!linkUrl.trim()) return;

    setAttachments(prev => [...prev, {
      type: 'link',
      name: linkTitle.trim() || linkUrl,
      url: linkUrl.trim()
    }]);

    setLinkUrl('');
    setLinkTitle('');
    setShowLinkInput(false);
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleReply = (post) => {
    setReplyingTo({
      id: post.id,
      author: getUserDisplayName(post),
      content: post.content?.substring(0, 100) + (post.content?.length > 100 ? '...' : '')
    });
    textInputRef.current?.focus();
  };

  const cancelReply = () => {
    setReplyingTo(null);
  };

  const sendMessage = async () => {
    if (!message.trim() && attachments.length === 0) return;

    try {
      const postData = {
        ministry,
        title: '',
        content: message.trim(),
        author_email: currentUserEmail,
        author_name: currentUserName || currentUserEmail,
        pinned: false,
        likes: [],
        attachments: attachments,
        comments: []
      };

      // Dodaj informacje o odpowiedzi jeśli odpowiadamy na wiadomość
      if (replyingTo) {
        postData.reply_to = {
          id: replyingTo.id,
          author: replyingTo.author,
          content: replyingTo.content
        };
      }

      const { error } = await supabase
        .from('wall_posts')
        .insert([postData]);

      if (error) throw error;

      setMessage('');
      setAttachments([]);
      setReplyingTo(null);
      fetchPosts();
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Blad wysylania: ' + err.message);
    }
  };

  const deletePost = async (postId) => {
    if (!confirm('Usunac ta wiadomosc?')) return;

    try {
      const { error } = await supabase
        .from('wall_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
      fetchPosts();
    } catch (err) {
      console.error('Error deleting post:', err);
    }
  };

  const toggleLike = async (post) => {
    const currentLikes = post.likes || [];
    const hasLiked = currentLikes.includes(currentUserEmail);

    const newLikes = hasLiked
      ? currentLikes.filter(email => email !== currentUserEmail)
      : [...currentLikes, currentUserEmail];

    try {
      const { error } = await supabase
        .from('wall_posts')
        .update({ likes: newLikes })
        .eq('id', post.id);

      if (error) throw error;

      setPosts(prev => prev.map(p =>
        p.id === post.id ? { ...p, likes: newLikes } : p
      ));
    } catch (err) {
      console.error('Error toggling like:', err);
    }
  };

  const togglePin = async (post) => {
    try {
      const { error } = await supabase
        .from('wall_posts')
        .update({ pinned: !post.pinned })
        .eq('id', post.id);

      if (error) throw error;
      fetchPosts();
    } catch (err) {
      console.error('Error toggling pin:', err);
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'wczoraj ' + date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else if (days < 7) {
      return date.toLocaleDateString('pl-PL', { weekday: 'short' }) + ' ' +
             date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' }) + ' ' +
             date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getUserAvatar = (email) => {
    return userAvatars[email]?.avatar || null;
  };

  const getUserDisplayName = (post) => {
    return userAvatars[post.author_email]?.name || post.author_name || post.author_email;
  };

  // Grupowanie wiadomosci po dacie
  const groupPostsByDate = (posts) => {
    const groups = {};
    posts.forEach(post => {
      const date = new Date(post.created_at).toLocaleDateString('pl-PL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
      if (!groups[date]) groups[date] = [];
      groups[date].push(post);
    });
    return groups;
  };

  const pinnedPosts = posts.filter(p => p.pinned);
  const regularPosts = posts.filter(p => !p.pinned);
  const groupedPosts = groupPostsByDate(regularPosts);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
      {/* Pinned messages */}
      {pinnedPosts.length > 0 && (
        <div className="bg-pink-50 dark:bg-pink-900/20 border-b border-pink-200 dark:border-pink-800 p-3">
          <div className="flex items-center gap-2 text-pink-600 dark:text-pink-400 text-xs font-bold uppercase mb-2">
            <Pin size={12} /> Przypiete wiadomosci
          </div>
          <div className="space-y-2">
            {pinnedPosts.map(post => (
              <div key={post.id} className="bg-white dark:bg-gray-800 rounded-lg p-3 text-sm border border-pink-200 dark:border-pink-800">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{getUserDisplayName(post)}</span>
                  {post.author_email === currentUserEmail && (
                    <button onClick={() => togglePin(post)} className="text-pink-500 hover:text-pink-700 p-1">
                      <Pin size={14} />
                    </button>
                  )}
                </div>
                <p className="text-gray-600 dark:text-gray-400 mt-1">{post.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-gray-50 dark:bg-gray-900/50">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <Send size={24} className="text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-700 dark:text-gray-300 mb-1">Brak wiadomosci</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Napisz pierwsza wiadomosc do zespolu!</p>
          </div>
        ) : (
          <>
            {Object.entries(groupedPosts).map(([date, datePosts]) => (
              <div key={date}>
                {/* Date separator */}
                <div className="flex items-center gap-4 my-4">
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 px-2">{date}</span>
                  <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                </div>

                {datePosts.map((post, idx) => {
                  const isOwn = post.author_email === currentUserEmail;
                  const hasLiked = (post.likes || []).includes(currentUserEmail);
                  const avatar = getUserAvatar(post.author_email);
                  const showAvatar = idx === 0 || datePosts[idx - 1]?.author_email !== post.author_email;

                  return (
                    <div
                      key={post.id}
                      className={`flex gap-3 mb-2 group relative hover:z-10 ${isOwn ? 'flex-row-reverse' : ''}`}
                    >
                      {/* Avatar */}
                      <div className={`w-9 h-9 shrink-0 ${!showAvatar ? 'invisible' : ''}`}>
                        {avatar ? (
                          <img
                            src={avatar}
                            alt=""
                            className="w-9 h-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm ${
                            isOwn
                              ? 'bg-gradient-to-br from-pink-500 to-orange-500'
                              : 'bg-gradient-to-br from-blue-500 to-purple-500'
                          }`}>
                            {(getUserDisplayName(post) || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Message bubble */}
                      <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'}`}>
                        {showAvatar && (
                          <div className={`flex items-center gap-2 mb-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                              {getUserDisplayName(post)}
                            </span>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                              {formatTime(post.created_at)}
                            </span>
                          </div>
                        )}

                        <div className={`relative rounded-2xl px-4 py-2.5 ${
                          isOwn
                            ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white rounded-tr-sm'
                            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-tl-sm'
                        }`}>
                          {/* Reply quote */}
                          {post.reply_to && (
                            <div className={`mb-2 p-2 rounded-lg border-l-2 ${
                              isOwn
                                ? 'bg-white/10 border-white/50'
                                : 'bg-gray-100 dark:bg-gray-700 border-pink-400'
                            }`}>
                              <div className="flex items-center gap-1 mb-0.5">
                                <CornerDownRight size={10} className={isOwn ? 'text-white/70' : 'text-gray-400'} />
                                <span className={`text-[10px] font-bold ${isOwn ? 'text-white/80' : 'text-pink-500'}`}>
                                  {post.reply_to.author}
                                </span>
                              </div>
                              <p className={`text-xs truncate ${isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                                {post.reply_to.content}
                              </p>
                            </div>
                          )}
                          {/* Content */}
                          {post.content && (
                            <p className="text-sm whitespace-pre-wrap break-words">{post.content}</p>
                          )}

                          {/* Attachments */}
                          {post.attachments && post.attachments.length > 0 && (
                            <div className={`mt-2 space-y-2 ${!post.content ? '-mt-0.5' : ''}`}>
                              {post.attachments.map((att, attIdx) => (
                                <div key={attIdx}>
                                  {att.type === 'image' ? (
                                    <a href={att.url} target="_blank" rel="noreferrer" className="block">
                                      <img
                                        src={att.url}
                                        alt={att.name}
                                        className="max-w-full max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition"
                                      />
                                    </a>
                                  ) : att.type === 'link' ? (
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`flex items-center gap-2 p-2 rounded-lg transition ${
                                        isOwn
                                          ? 'bg-white/20 hover:bg-white/30'
                                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                                      }`}
                                    >
                                      <ExternalLink size={16} className={isOwn ? 'text-white/80' : 'text-blue-500'} />
                                      <span className={`text-sm truncate ${isOwn ? 'text-white/90' : 'text-blue-600 dark:text-blue-400'}`}>
                                        {att.name}
                                      </span>
                                    </a>
                                  ) : (
                                    <a
                                      href={att.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`flex items-center gap-2 p-2 rounded-lg transition ${
                                        isOwn
                                          ? 'bg-white/20 hover:bg-white/30'
                                          : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                                      }`}
                                    >
                                      <FileText size={16} className={isOwn ? 'text-white/80' : 'text-gray-500'} />
                                      <div className="flex-1 min-w-0">
                                        <p className={`text-sm truncate ${isOwn ? 'text-white/90' : 'text-gray-800 dark:text-gray-200'}`}>
                                          {att.name}
                                        </p>
                                        {att.size && (
                                          <p className={`text-[10px] ${isOwn ? 'text-white/60' : 'text-gray-400'}`}>
                                            {formatFileSize(att.size)}
                                          </p>
                                        )}
                                      </div>
                                      <Download size={14} className={isOwn ? 'text-white/60' : 'text-gray-400'} />
                                    </a>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Actions */}
                          <div className={`absolute -bottom-5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition z-20 ${
                            isOwn ? 'right-0' : 'left-0'
                          }`}>
                            <button
                              onClick={() => handleReply(post)}
                              className="p-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-blue-500 transition"
                              title="Odpowiedz"
                            >
                              <Reply size={12} />
                            </button>
                            <button
                              onClick={() => toggleLike(post)}
                              className={`p-1 rounded-full transition ${
                                hasLiked
                                  ? 'bg-pink-100 dark:bg-pink-900/50 text-pink-500'
                                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-pink-500'
                              }`}
                            >
                              <Heart size={12} fill={hasLiked ? 'currentColor' : 'none'} />
                            </button>
                            {(post.likes || []).length > 0 && (
                              <span className="text-[10px] text-gray-500">{post.likes.length}</span>
                            )}
                            {isOwn && (
                              <>
                                <button
                                  onClick={() => togglePin(post)}
                                  className={`p-1 rounded-full transition ${
                                    post.pinned
                                      ? 'bg-pink-100 dark:bg-pink-900/50 text-pink-500'
                                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-pink-500'
                                  }`}
                                >
                                  <Pin size={12} />
                                </button>
                                <button
                                  onClick={() => deletePost(post.id)}
                                  className="p-1 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-red-500 transition"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-3">
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, idx) => (
              <div
                key={idx}
                className="relative group bg-white dark:bg-gray-700 rounded-lg p-2 pr-8 border border-gray-200 dark:border-gray-600"
              >
                {att.type === 'image' ? (
                  <div className="flex items-center gap-2">
                    <img src={att.url} alt="" className="w-10 h-10 rounded object-cover" />
                    <span className="text-xs text-gray-600 dark:text-gray-300 max-w-[100px] truncate">{att.name}</span>
                  </div>
                ) : att.type === 'link' ? (
                  <div className="flex items-center gap-2">
                    <LinkIcon size={16} className="text-blue-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-300 max-w-[150px] truncate">{att.name}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-gray-500" />
                    <span className="text-xs text-gray-600 dark:text-gray-300 max-w-[100px] truncate">{att.name}</span>
                  </div>
                )}
                <button
                  onClick={() => removeAttachment(idx)}
                  className="absolute top-1 right-1 p-1 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 hover:bg-red-100 hover:text-red-500 transition"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Link input */}
      {showLinkInput && (
        <div className="bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="URL linku..."
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
            />
            <input
              type="text"
              placeholder="Tytul (opcjonalnie)"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              className="w-40 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
            />
            <button
              onClick={addLink}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition"
            >
              Dodaj
            </button>
            <button
              onClick={() => { setShowLinkInput(false); setLinkUrl(''); setLinkTitle(''); }}
              className="px-3 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Reply indicator */}
      {replyingTo && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <CornerDownRight size={14} className="text-blue-500 shrink-0" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                  Odpowiadasz do {replyingTo.author}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {replyingTo.content}
                </p>
              </div>
            </div>
            <button
              onClick={cancelReply}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Message input */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2">
          {/* Attachment buttons */}
          <div className="flex gap-1">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'image')}
            />
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={uploading}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-500 transition"
              title="Dodaj zdjecie"
            >
              <Image size={20} />
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e, 'file')}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-500 transition"
              title="Dodaj plik"
            >
              <Paperclip size={20} />
            </button>

            <button
              onClick={() => setShowLinkInput(!showLinkInput)}
              className={`w-10 h-10 flex items-center justify-center rounded-xl transition ${
                showLinkInput
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-500'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:text-pink-500'
              }`}
              title="Dodaj link"
            >
              <LinkIcon size={20} />
            </button>
          </div>

          {/* Text input */}
          <div className="flex-1">
            <input
              ref={textInputRef}
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Napisz wiadomosc..."
              className="w-full h-10 px-4 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white placeholder-gray-400 focus:outline-none focus:border-pink-500 focus:ring-2 focus:ring-pink-500/20 transition text-sm"
            />
          </div>

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={!message.trim() && attachments.length === 0}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-lg hover:shadow-pink-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition transform hover:scale-105 active:scale-95"
          >
            <Send size={18} />
          </button>
        </div>

        {uploading && (
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-pink-500"></div>
            Przesylanie...
          </div>
        )}
      </div>
    </div>
  );
}
