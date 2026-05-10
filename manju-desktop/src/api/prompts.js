import request from '@/utils/request'

export const promptOverridesAPI = {
  list: () => request.get('/prompt-overrides'),
  save: (key, content) => request.post('/prompt-overrides', { key, content }),
  delete: (id) => request.delete(`/prompt-overrides/${id}`),
}

export const generationSettingsAPI = {
  get: () => request.get('/generation-settings'),
  update: (data) => request.post('/generation-settings', data),
}

export const sceneModelMapAPI = {
  list: () => request.get('/scene-model-map'),
  save: (data) => request.post('/scene-model-map', data),
  delete: (id) => request.delete(`/scene-model-map/${id}`),
}
