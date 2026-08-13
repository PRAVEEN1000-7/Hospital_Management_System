import api from './api';

const suggestionService = {
  async getSuggestion(field: string, text: string, signal?: AbortSignal): Promise<string> {
    const res = await api.post<{ suggestion: string }>(
      '/suggestions/note',
      { field, text: text.slice(-200) },
      { signal }
    );
    return res.data.suggestion;
  },
};

export default suggestionService;
