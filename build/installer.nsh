; MarkIt Windows 安装向导自定义脚本
;
; 说明：electron-builder 的 assisted installer 本身没有「是否创建快捷方式」页面，
; 因此在这里接管快捷方式的创建与删除：
;   1. electron-builder.yml 中 createDesktopShortcut / createStartMenuShortcut 设为 false，
;      关闭内置创建逻辑（同时内置卸载器也不再生效）；
;   2. customInit 在卸载旧版本前记录快捷方式是否存在，静默升级按该状态重建；
;   3. customPageAfterChangeDir 插入「附加任务」页供用户勾选；
;   4. customInstall / customUnInstall 按勾选结果创建、删除快捷方式。
;
; 本文件包含中文界面文案，必须保存为 UTF-8 with BOM。

!ifndef BUILD_UNINSTALLER

Var ShortcutOptDesktop
Var ShortcutOptStartMenu
Var ShortcutOptDesktopCheckbox
Var ShortcutOptStartMenuCheckbox

; 在卸载旧版本之前执行：记录当前快捷方式状态，作为默认值与静默升级依据
!macro customInit
  !insertmacro setLinkVars

  ReadRegStr $0 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $0 == ""
    ; 全新安装：默认创建两种快捷方式
    StrCpy $ShortcutOptDesktop "1"
    StrCpy $ShortcutOptStartMenu "1"
  ${Else}
    ; 覆盖安装 / 升级：按快捷方式当前是否存在预选
    StrCpy $ShortcutOptDesktop "0"
    StrCpy $ShortcutOptStartMenu "0"
    ${If} ${FileExists} "$newDesktopLink"
      StrCpy $ShortcutOptDesktop "1"
    ${EndIf}
    ${If} ${FileExists} "$newStartMenuLink"
      StrCpy $ShortcutOptStartMenu "1"
    ${EndIf}
  ${EndIf}
!macroend

; 安装目录页之后的「附加任务」页
!macro customPageAfterChangeDir
  Function ShortcutOptionsPageCreate
    ${If} ${isUpdated}
      Abort
    ${EndIf}

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    !insertmacro MUI_HEADER_TEXT "选择附加任务" "选择安装程序要创建的快捷方式；取消勾选后仍可从安装目录或搜索启动 MarkIt。"

    ${NSD_CreateCheckbox} 0 0u 100% 12u "创建桌面快捷方式"
    Pop $ShortcutOptDesktopCheckbox
    ${If} $ShortcutOptDesktop == "1"
      ${NSD_Check} $ShortcutOptDesktopCheckbox
    ${EndIf}

    ${NSD_CreateCheckbox} 0 16u 100% 12u "创建开始菜单快捷方式"
    Pop $ShortcutOptStartMenuCheckbox
    ${If} $ShortcutOptStartMenu == "1"
      ${NSD_Check} $ShortcutOptStartMenuCheckbox
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function ShortcutOptionsPageLeave
    ${NSD_GetState} $ShortcutOptDesktopCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $ShortcutOptDesktop "1"
    ${Else}
      StrCpy $ShortcutOptDesktop "0"
    ${EndIf}

    ${NSD_GetState} $ShortcutOptStartMenuCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $ShortcutOptStartMenu "1"
    ${Else}
      StrCpy $ShortcutOptStartMenu "0"
    ${EndIf}
  FunctionEnd

  Page custom ShortcutOptionsPageCreate ShortcutOptionsPageLeave
!macroend

; 文件与注册表写入完成后创建 / 清理快捷方式
!macro customInstall
  ${If} $ShortcutOptDesktop == "1"
    ${IfNot} ${isNoDesktopShortcut}
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${EndIf}
  ${Else}
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
  ${EndIf}

  ${If} $ShortcutOptStartMenu == "1"
    !insertmacro createMenuDirectory
    CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
  ${Else}
    WinShell::UninstShortcut "$newStartMenuLink"
    Delete "$newStartMenuLink"
  ${EndIf}

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!endif

; 卸载时删除安装程序创建的快捷方式；升级流程带 --keep-shortcuts 时保留
!macro customUnInstall
  ${IfNot} ${isKeepShortcuts}
    WinShell::UninstShortcut "$oldDesktopLink"
    Delete "$oldDesktopLink"

    WinShell::UninstShortcut "$oldStartMenuLink"
    Delete "$oldStartMenuLink"
    ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
    ${IfNot} $R1 == ""
      RMDir "$SMPROGRAMS\$R1"
    ${EndIf}

    System::Call 'shell32::SHChangeNotify(i, i, i, i) v (0x08000000, 0, 0, 0)'
  ${EndIf}
!macroend
