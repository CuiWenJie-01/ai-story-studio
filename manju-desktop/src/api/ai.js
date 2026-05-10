import request from '@/utils/request'

export const aiAPI = {
  list: () => request.get('/ai-config'),
  create: (data) => request.post('/ai-config', data),
  update: (id, data) => request.put(`/ai-config/${id}`, data),
  delete: (id) => request.delete(`/ai-config/${id}`),
  testConnection: (data) => request.post('/ai-config/test', data),
  listJimeng2MaterialAssets: (data) => request.post('/ai-config/jimeng2-assets', data),
}
