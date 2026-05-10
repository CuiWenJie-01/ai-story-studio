import request from '@/utils/request'

export const sceneAPI = {
  list(params) {
    return request.get('/scenes', { params })
  },
  create(data) {
    return request.post('/scenes', data)
  },
  update(id, data) {
    return request.put(`/scenes/${id}`, data)
  },
  delete(id) {
    return request.delete(`/scenes/${id}`)
  },
  generateImage(data) {
    return request.post('/scenes/generate-image', data)
  }
}
