import { ref, watch } from 'vue'

const isDark = ref(localStorage.getItem('theme') !== 'light')

watch(isDark, (val) => {
  document.documentElement.classList.toggle('light', !val)
  localStorage.setItem('theme', val ? 'dark' : 'light')
}, { immediate: true })

export function useTheme() {
  function toggle() {
    isDark.value = !isDark.value
  }
  return { isDark, toggle }
}
