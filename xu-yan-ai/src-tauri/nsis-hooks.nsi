; NSIS hooks for 旭言AI - Register folder context menu

!macro NSIS_HOOK_POSTINSTALL
  ; Register right-click context menu for folders
  WriteRegStr SHCTX "Software\Classes\Directory\shell\XuYanAI" "" "用旭言AI打开"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\XuYanAI" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\XuYanAI\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Remove right-click context menu entries
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\XuYanAI"
!macroend
