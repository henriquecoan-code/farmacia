' Roda o sync do ERP sem abrir janela. Usado pelas tarefas agendadas (ver agendar-sync.ps1).
'   wscript.exe run-oculto.vbs estoque     ou     wscript.exe run-oculto.vbs completo
' Espera o sync terminar e devolve o codigo dele, para o Agendador de Tarefas mostrar se deu certo.
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
modo = "estoque"
If WScript.Arguments.Count > 0 Then modo = WScript.Arguments(0)
If modo <> "estoque" And modo <> "completo" Then WScript.Quit 2
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & pasta & "\run-sync-erp.ps1"" -Modo " & modo & " -Agendado"
WScript.Quit CreateObject("WScript.Shell").Run(cmd, 0, True)
