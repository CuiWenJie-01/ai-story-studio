import request from '@/utils/request'

export const videosAPI = {
  create(data) {
    return request.post('/videos', data)
  },
  list(params) {
    return request.get('/videos', { params })
  },
  get(id) {
    return request.get(`/videos/${id}`)
  },
  delete(id) {
    return request.delete(`/videos/${id}`)
  }
}
