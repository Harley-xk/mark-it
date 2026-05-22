import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PreviewStyle } from '../types'

import githubCss from '../styles/preview/github.css?raw'
import darkCss from '../styles/preview/dark.css?raw'
import academicCss from '../styles/preview/academic.css?raw'
import minimalCss from '../styles/preview/minimal.css?raw'

import githubLightCss from '../styles/preview/github-light.css?raw'
import darkLightCss from '../styles/preview/dark-light.css?raw'
import academicLightCss from '../styles/preview/academic-light.css?raw'
import minimalLightCss from '../styles/preview/minimal-light.css?raw'

const builtinStylesDark: PreviewStyle[] = [
  { id: 'github', name: 'GitHub', css: githubCss, isBuiltin: true },
  { id: 'dark', name: 'Dark', css: darkCss, isBuiltin: true },
  { id: 'academic', name: 'Academic', css: academicCss, isBuiltin: true },
  { id: 'minimal', name: 'Minimal', css: minimalCss, isBuiltin: true },
]

const builtinStylesLight: PreviewStyle[] = [
  { id: 'github', name: 'GitHub', css: githubLightCss, isBuiltin: true },
  { id: 'dark', name: 'Dark', css: darkLightCss, isBuiltin: true },
  { id: 'academic', name: 'Academic', css: academicLightCss, isBuiltin: true },
  { id: 'minimal', name: 'Minimal', css: minimalLightCss, isBuiltin: true },
]

export const useStyleStore = defineStore('style', () => {
  const customStyles = ref<PreviewStyle[]>([])
  const currentStyleId = ref('github')

  function builtinStyles(isDark: boolean): PreviewStyle[] {
    return isDark ? builtinStylesDark : builtinStylesLight
  }

  function allStyles(isDark: boolean): PreviewStyle[] {
    return [...builtinStyles(isDark), ...customStyles.value]
  }

  function currentStyle(isDark: boolean): PreviewStyle {
    return allStyles(isDark).find(s => s.id === currentStyleId.value) || builtinStyles(isDark)[0]
  }

  function currentCss(isDark: boolean): string {
    return currentStyle(isDark).css
  }

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
    customStyles, currentStyleId,
    builtinStyles, allStyles, currentStyle, currentCss,
    setStyle, addCustomStyle, removeCustomStyle
  }
})
