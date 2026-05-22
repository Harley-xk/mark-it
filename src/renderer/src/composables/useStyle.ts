import { ref, computed } from 'vue'
import type { PreviewStyle } from '../types'

import githubCss from '../styles/preview/github.css?raw'
import darkCss from '../styles/preview/dark.css?raw'
import academicCss from '../styles/preview/academic.css?raw'
import minimalCss from '../styles/preview/minimal.css?raw'

const builtinStyles: PreviewStyle[] = [
  { id: 'github', name: 'GitHub', css: githubCss, isBuiltin: true },
  { id: 'dark', name: 'Dark', css: darkCss, isBuiltin: true },
  { id: 'academic', name: 'Academic', css: academicCss, isBuiltin: true },
  { id: 'minimal', name: 'Minimal', css: minimalCss, isBuiltin: true },
]

export function useStyle() {
  const customStyles = ref<PreviewStyle[]>([])
  const currentStyleId = ref('github')

  const allStyles = computed(() => [...builtinStyles, ...customStyles.value])

  const currentStyle = computed(() =>
    allStyles.value.find(s => s.id === currentStyleId.value) || builtinStyles[0]
  )

  const currentCss = computed(() => currentStyle.value.css)

  function setStyle(id: string) {
    currentStyleId.value = id
  }

  function addCustomStyle(style: PreviewStyle) {
    customStyles.value.push(style)
  }

  function removeCustomStyle(id: string) {
    customStyles.value = customStyles.value.filter(s => s.id !== id)
    if (currentStyleId.value === id) {
      currentStyleId.value = 'github'
    }
  }

  return {
    builtinStyles, customStyles, allStyles,
    currentStyleId, currentStyle, currentCss,
    setStyle, addCustomStyle, removeCustomStyle
  }
}
