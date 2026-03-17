import React from 'react';
import { CheckSquare, Calendar, Heart } from 'lucide-react';

export default function WelcomeWidget({ userProfile, userEmail, stats }) {
  const displayName = userProfile?.full_name || userEmail?.split('@')[0] || 'Użytkowniku';
  const firstName = displayName.split(' ')[0];

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Dzień dobry';
    if (hour < 18) return 'Witaj';
    return 'Dobry wieczór';
  };

  return (
    <div className="flex flex-col md:flex-row items-center gap-6">
      {/* Avatar */}
      <div className="relative">
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-pink-500 to-orange-500 p-1 shadow-lg">
          {userProfile?.avatar_url ? (
            <img
              src={userProfile.avatar_url}
              alt="Avatar"
              className="w-full h-full rounded-xl object-cover"
            />
          ) : (
            <div className="w-full h-full rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center">
              <span className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-orange-600 uppercase">
                {firstName.charAt(0)}
              </span>
            </div>
          )}
        </div>
        {/* Online indicator */}
        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full border-3 border-white dark:border-gray-800" />
      </div>

      {/* Greeting & Stats */}
      <div className="flex-1 text-center md:text-left">
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">
          {getGreeting()},
        </p>
        <h2 className="text-2xl md:text-3xl font-bold text-gray-800 dark:text-white mb-3">
          {firstName}! <span className="text-gray-400 dark:text-gray-500">Miło Cię widzieć</span>
        </h2>

        {/* Quick Stats */}
        <div className="flex flex-wrap justify-center md:justify-start gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <CheckSquare size={16} className="text-blue-500" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              {stats.tasksCount} {stats.tasksCount === 1 ? 'zadanie' : 'zadań'}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <Calendar size={16} className="text-purple-500" />
            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
              {stats.upcomingServicesCount} {stats.upcomingServicesCount === 1 ? 'służba' : 'służb'}
            </span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
            <Heart size={16} className="text-pink-500" />
            <span className="text-sm font-medium text-pink-700 dark:text-pink-300">
              {stats.prayersCount} {stats.prayersCount === 1 ? 'modlitwa' : 'modlitw'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
