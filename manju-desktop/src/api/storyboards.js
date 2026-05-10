import request from '@/utils/request'

export const storyboardAPI = {
  list(episodeId) {
    return request.get(`/episodes/${episodeId}/storyboards`)
  },
  create(episodeId, data) {
    return request.post(`/episodes/${episodeId}/storyboards`, data)
  },
  update(id, data) {
    return request.put(`/storyboards/${id}`, data)
  },
  delete(id) {
    return request.delete(`/storyboards/${id}`)
  },
  generateImage(id, data) {
    return request.post(`/storyboards/${id}/generate-image`, data)
  },
  generateVideo(id, data) {
    return request.post(`/storyboards/${id}/generate-video`, data)
  }
}
