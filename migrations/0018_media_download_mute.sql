-- 0018_media_download_mute.sql
-- Media Downloader: optional "mute video" — strip the audio track from the
-- stored mp4 (ffmpeg -an) while keeping want_audio for a separate MP3.
ALTER TABLE media_downloads
  ADD COLUMN IF NOT EXISTS mute_video boolean NOT NULL DEFAULT false;
