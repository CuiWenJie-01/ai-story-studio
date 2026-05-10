export const styleOptions = [
  {
    label: '写实 / 影视',
    options: [
      { label: '写实', value: 'realistic' },
      { label: '电影感', value: 'cinematic' },
      { label: '纪录片', value: 'documentary' },
      { label: '黑色电影', value: 'noir' },
      { label: '复古胶片', value: 'retro film' },
      { label: '恐怖', value: 'horror' }
    ]
  },
  {
    label: '动漫 / 卡通',
    options: [
      { label: '日本动漫', value: 'anime style' },
      { label: '欧美漫画', value: 'comic style' },
      { label: '卡通', value: 'cartoon' }
    ]
  },
  {
    label: '中国风格',
    options: [
      { label: '国画水墨', value: 'ink wash' },
      { label: '中国风', value: 'chinese style' },
      { label: '古装', value: 'historical' },
      { label: '武侠', value: 'wuxia' }
    ]
  },
  {
    label: '绘画艺术',
    options: [
      { label: '水彩', value: 'watercolor' },
      { label: '油画', value: 'oil painting' },
      { label: '素描', value: 'sketch' },
      { label: '版画', value: 'woodblock print' },
      { label: '印象派', value: 'impressionist' }
    ]
  },
  {
    label: '幻想 / 科幻',
    options: [
      { label: '奇幻', value: 'fantasy' },
      { label: '暗黑奇幻', value: 'dark fantasy' },
      { label: '科幻', value: 'sci-fi' },
      { label: '赛博朋克', value: 'cyberpunk' },
      { label: '蒸汽朋克', value: 'steampunk' },
      { label: '末世废土', value: 'post-apocalyptic' }
    ]
  },
  {
    label: '数字 / 现代',
    options: [
      { label: '3D 渲染', value: '3d render' },
      { label: '像素风', value: 'pixel art' },
      { label: '低多边形', value: 'low poly' },
      { label: '极简', value: 'minimalist' },
      { label: '唯美梦幻', value: 'dreamy' }
    ]
  }
]

export function stylePromptMetadataForSave(style) {
  const map = {
    realistic: { style_prompt: 'realistic, photorealistic, highly detailed, 8k uhd' },
    cinematic: { style_prompt: 'cinematic, film grain, dramatic lighting, color grading, anamorphic lens' },
    documentary: { style_prompt: 'documentary style, natural lighting, handheld camera feel, authentic' },
    noir: { style_prompt: 'film noir, high contrast, black and white, dramatic shadows, 1940s style' },
    'retro film': { style_prompt: 'vintage film, retro aesthetic, film grain, warm tones, nostalgic' },
    horror: { style_prompt: 'horror, dark atmosphere, creepy lighting, unsettling, cinematic horror' },
    'anime style': { style_prompt: 'anime style, japanese animation, vibrant colors, detailed anime art' },
    'comic style': { style_prompt: 'comic book style, bold lines, vibrant colors, graphic novel art' },
    cartoon: { style_prompt: 'cartoon style, animated, colorful, whimsical, 3d cartoon render' },
    'ink wash': { style_prompt: 'chinese ink wash painting, sumi-e, traditional brush strokes, monochrome, artistic' },
    'chinese style': { style_prompt: 'chinese traditional art style, oriental aesthetics, elegant, cultural' },
    historical: { style_prompt: 'historical drama style, period costume, ancient setting, cinematic' },
    wuxia: { style_prompt: 'wuxia style, martial arts, chinese fantasy, flowing robes, dynamic action' },
    watercolor: { style_prompt: 'watercolor painting, soft edges, artistic, painterly, delicate colors' },
    'oil painting': { style_prompt: 'oil painting, rich textures, classical art, canvas texture, masterpiece' },
    sketch: { style_prompt: 'pencil sketch, hand drawn, artistic sketch, monochrome, detailed lines' },
    'woodblock print': { style_prompt: 'woodblock print style, ukiyo-e, traditional japanese art, bold outlines' },
    impressionist: { style_prompt: 'impressionist painting, visible brushstrokes, light effects, monet style' },
    fantasy: { style_prompt: 'fantasy art, magical, ethereal, otherworldly, detailed fantasy illustration' },
    'dark fantasy': { style_prompt: 'dark fantasy, gothic, ominous, mysterious, shadowy atmosphere' },
    'sci-fi': { style_prompt: 'science fiction, futuristic, high tech, neon lights, cyber aesthetic' },
    cyberpunk: { style_prompt: 'cyberpunk, neon city, futuristic, high contrast, dystopian, rain soaked streets' },
    steampunk: { style_prompt: 'steampunk, victorian era, brass gears, steam powered, retro futuristic' },
    'post-apocalyptic': { style_prompt: 'post apocalyptic, wasteland, ruined city, survival, desolate atmosphere' },
    '3d render': { style_prompt: '3d render, octane render, blender, cgi, photorealistic 3d' },
    'pixel art': { style_prompt: 'pixel art, 8-bit, retro game style, pixelated, nostalgic gaming' },
    'low poly': { style_prompt: 'low poly art, geometric, minimalist 3d, clean shapes, stylized' },
    minimalist: { style_prompt: 'minimalist, clean design, simple shapes, negative space, modern art' },
    dreamy: { style_prompt: 'dreamy, ethereal, soft focus, pastel colors, whimsical, fantasy atmosphere' }
  }
  return map[style] || {}
}

export async function backfillDramaStylePromptMetadataIfNeeded(dramaAPI, dramaId, drama) {
  if (!drama) return drama
  const style = drama.style
  if (!style) return drama
  const metadata = drama.metadata || {}
  if (metadata.style_prompt) return drama
  const styleMeta = stylePromptMetadataForSave(style)
  if (styleMeta.style_prompt) {
    try {
      await dramaAPI.saveOutline(dramaId, {
        metadata: { ...metadata, ...styleMeta }
      })
      drama.metadata = { ...metadata, ...styleMeta }
    } catch (e) {
      console.warn('backfill style metadata failed', e)
    }
  }
  return drama
}
