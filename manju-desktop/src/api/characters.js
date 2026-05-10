import request from '@/utils/request'

export const characterAPI = {
  list(params) {
    return request.get('/characters', { params })
  },
  create(data) {
    return request.post('/characters', data)
  },
  update(id, data) {
    return request.put(`/characters/${id}`, data)
  },
  delete(id) {
    return request.delete(`/characters/${id}`)
  },
  putImage(id, data) {
    return request.put(`/characters/${id}/image`, data)
  },
  generateImage(id, prompt, style) {
    return request.post(`/characters/${id}/generate-image`, { prompt, style })
  }
}
