' Inicia o Transcreve Zap em segundo plano, sem janela.
Set fso = CreateObject("Scripting.FileSystemObject")
raiz = fso.GetParentFolderName(WScript.ScriptFullName)
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = raiz
sh.Run """" & raiz & "\ferramentas\node\node.exe"" """ & raiz & "\src\index.js""", 0, False
