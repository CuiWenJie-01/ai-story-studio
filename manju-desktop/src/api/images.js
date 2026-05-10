import request from '@/utils/request'

export const imagesAPI = {
  create(data) {
    return request.post('/images', data)
  },
  list(params) {
    return request.get('/images', { params })
  },
  get(id) {
    return request.get(`/images/${id}`)
  },
  delete(id) {
    return request.delete(`/images/${id}`)
  }
}
