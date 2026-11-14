# Test song

The song used to verify `songprep import` end to end on real music.

| | |
|---|---|
| Title | Swansong |
| Artist | Josh Woodward |
| Album | Breadcrumbs |
| Length | 4:22 (261.5 s), MP3, 44.1 kHz stereo |
| Song page | https://www.joshwoodward.com/song/Swansong |
| Audio file | https://www.joshwoodward.com/mp3/Breadcrumbs/JoshWoodward-Breadcrumbs-01-Swansong.mp3 |
| Licence | Creative Commons Attribution 4.0 (CC BY 4.0), https://creativecommons.org/licenses/by/4.0/ |
| Licence statement | The song page says "This work is licensed under a Creative Commons Attribution 4.0 License"; the artist's FAQ (https://joshwoodward.com/faq) says "all of my original music is licensed as Creative Commons 4.0 Attribution" |
| Downloaded | 2026-11-14 |
| SHA-256 of the MP3 | `321174573eea651b267fe217a9b56501ee7a335c3de6ced8cf89b4c7811fb811` |

Credit, in the form the artist asks for:

> Music - "Swansong" by Josh Woodward. Free download: https://www.joshwoodward.com/

Why this song: one male lead vocal over a band arrangement, with verses, a
repeated chorus and a bridge, and the artist publishes the lyrics on the song
page under the same licence.

## Where the files are

Neither the audio nor the lyrics are in git. Both `data/` and `songs/` are git-ignored.

| File | Path |
|---|---|
| Audio | `data/test-audio/swansong/JoshWoodward-Breadcrumbs-01-Swansong.mp3` |
| Lyrics (plain text, from the song page, with "[Chorus x 2]" written out) | `data/test-audio/swansong/swansong_lyrics.txt` |
| Package | `songs/josh-woodward-swansong/` |

## Getting it again

```sh
mkdir -p data/test-audio/swansong
curl -o data/test-audio/swansong/JoshWoodward-Breadcrumbs-01-Swansong.mp3 \
  https://www.joshwoodward.com/mp3/Breadcrumbs/JoshWoodward-Breadcrumbs-01-Swansong.mp3

cd songprep
uv run songprep import ../data/test-audio/swansong/JoshWoodward-Breadcrumbs-01-Swansong.mp3 \
  --artist "Josh Woodward" --title "Swansong" \
  --lyrics ../data/test-audio/swansong/swansong_lyrics.txt
```
