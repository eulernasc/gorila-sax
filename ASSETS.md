# Bruno — assets da v10

## Sax local
A v10 não depende mais de áudio externo em tempo de execução.
O solo é um pequeno riff original renderizado localmente para o jogo e incluído em dois formatos:
- `assets/sax-solo.m4a` — prioridade para iPhone/Safari
- `assets/sax-solo.mp3` — fallback para outros navegadores

O áudio é disparado via Web Audio API após o primeiro gesto do usuário. Isso evita bloqueios de autoplay e atrasos de rede no celular.

## Voz
A fala em áudio “Bruno é demais” foi removida na v10 para eliminar o segundo gatilho de áudio que estava falhando no iPhone. O texto continua aparecendo em balão após a ação.
