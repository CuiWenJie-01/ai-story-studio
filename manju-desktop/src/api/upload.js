import request from '@/utils/request'

export const uploadAPI = {
  uploadImage(file, metadata = {}) {
    const form = new FormData()
    form.append('file', file)
    if (metadata.dramaId) form.append('drama_id', metadata.dramaId)
    return request.post('/upload/image', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  },
  uploadVideo(file, metadata = {}) {
    const form = new FormData()
    form.append('file', file)
    if (metadata.dramaId) form.append('drama_id', metadata.dramaId)
    return request.post('/upload/video', form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
  }
}
