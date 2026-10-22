# SongScout — Offline Music Library

SongScout is a static music library page served from the LittleEulers GitHub Pages site.

## Website address

After GitHub Pages publishes the commit, the expected address is:

https://littleeulers.github.io/songscout/

## Add audio files

Only upload audio that you own or are permitted to distribute. Spotify Premium/offline downloads are not transferable audio files.

1. Open this repository and go to `songscout/`.
2. Create a folder named `music` if it does not exist.
3. Use **Add file → Upload files** to upload permitted MP3 or M4A files into `songscout/music/`.
4. Open `songscout/index.html` and edit the `TRACKS` array. Add one entry for each audio file, using the matching path. Example:

```js
const TRACKS = [
  {
    title: "Song Title",
    artist: "Artist Name",
    album: "Album Name",
    file: "music/song-title.mp3"
  }
];
```

5. Commit the changes. Once Pages updates, the song will appear in the site, and the Play and Download controls will use that file.

## Offline listening

A classmate must download each audio file while online before listening offline. The hosted website itself still needs an internet connection to open. For fully offline browsing, include the HTML file and the audio files in a ZIP and download it ahead of time.

Note: use simple filenames without spaces when possible, and keep audio files reasonably small. GitHub repositories and Pages are not intended to be a large-scale music hosting service.
