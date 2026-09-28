# Raga audio

`src/audio/RagaEngine.ts` looks for these recorded tracks (paths come from
`public/assets/content/ragas.json`). Any file that is missing is replaced by
a synthesised tanpura drone plus a slow phrase generator built from the raga's
aroha / avaroha / pakad, so the game works with this folder empty.

| File                  | Raga              | Game phase |
| --------------------- | ----------------- | ---------- |
| `darbari-raga.mp3`    | Darbari Kanada    | Lobby      |
| `morning-raga.mp3`    | Bhairav           | Morning    |
| `midday-raga.mp3`     | Brindavani Sarang | Midday     |
| `afternoon-raga.mp3`  | Multani           | Afternoon  |
| `evening-raga.mp3`    | Yaman             | Sunset     |
| `closing-raga.mp3`    | Bhairavi          | Debrief    |

Only add recordings you have the rights to distribute. Tracks loop, so a
2–4 minute alaap works well.
