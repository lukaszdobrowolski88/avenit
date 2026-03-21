export function formatAnswerForExport(answer, fieldType) {
  if (answer === null || answer === undefined) return '';

  if (fieldType === 'checkbox' && Array.isArray(answer)) {
    return answer.join(', ');
  }

  if (fieldType === 'file' && typeof answer === 'object') {
    return answer.url || answer.name || '';
  }

  return String(answer);
}

export function exportToCSV(form, responses) {
  if (!form || !responses || responses.length === 0) {
    return null;
  }

  const fields = form.fields || [];
  const headers = ['Data wysłania', ...fields.map(f => f.label)];

  const rows = responses.map(response => {
    const date = new Date(response.submitted_at).toLocaleString('pl-PL');
    const answers = fields.map(field => {
      const answer = response.answers[field.id];
      return formatAnswerForExport(answer, field.type);
    });
    return [date, ...answers];
  });

  const escapeCell = (cell) => {
    const str = String(cell);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  let csv = '\uFEFF';
  csv += headers.map(escapeCell).join(',') + '\n';
  rows.forEach(row => {
    csv += row.map(escapeCell).join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(form.title)}_odpowiedzi.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return true;
}

export function exportToJSON(form, responses) {
  if (!form || !responses || responses.length === 0) {
    return null;
  }

  const fields = form.fields || [];

  const exportData = responses.map(response => {
    const formattedResponse = {
      submitted_at: response.submitted_at,
      respondent_email: response.respondent_email,
      respondent_name: response.respondent_name
    };

    fields.forEach(field => {
      formattedResponse[field.label] = response.answers[field.id];
    });

    return formattedResponse;
  });

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(form.title)}_odpowiedzi.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return true;
}

function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ\s-]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}

export function getResponseStats(form, responses) {
  if (!form || !responses || responses.length === 0) {
    return null;
  }

  const fields = form.fields || [];
  const stats = {};

  fields.forEach(field => {
    const fieldStats = {
      fieldId: field.id,
      label: field.label,
      type: field.type,
      totalResponses: 0,
      emptyResponses: 0
    };

    if (['select', 'radio', 'checkbox'].includes(field.type)) {
      fieldStats.optionCounts = {};
      (field.options || []).forEach(opt => {
        fieldStats.optionCounts[opt.value] = 0;
      });
    }

    responses.forEach(response => {
      const answer = response.answers[field.id];

      if (answer === null || answer === undefined || answer === '') {
        fieldStats.emptyResponses++;
      } else {
        fieldStats.totalResponses++;

        if (field.type === 'checkbox' && Array.isArray(answer)) {
          answer.forEach(val => {
            if (fieldStats.optionCounts && fieldStats.optionCounts[val] !== undefined) {
              fieldStats.optionCounts[val]++;
            }
          });
        } else if (['select', 'radio'].includes(field.type)) {
          if (fieldStats.optionCounts && fieldStats.optionCounts[answer] !== undefined) {
            fieldStats.optionCounts[answer]++;
          }
        }
      }
    });

    stats[field.id] = fieldStats;
  });

  return stats;
}
