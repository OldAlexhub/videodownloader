"""Generate tiny, original synthetic fixtures. Requires ffmpeg on PATH."""
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
media = root / 'qa' / 'media'
media.mkdir(parents=True, exist_ok=True)
for name, color, size, tone in [('content', 'teal', '640x360', 440), ('high', 'teal', '1280x720', 440), ('promo', 'red', '640x360', 880), ('other', 'blue', '640x360', 220)]:
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', f'color=c={color}:s={size}:r=24:d=6', '-f', 'lavfi', '-i', f'sine=frequency={tone}:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', str(media / f'{name}.mp4')], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(media / 'content.mp4'), '-an', '-c:v', 'copy', str(media / 'silent.mp4')], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(media / 'content.mp4'), '-c', 'copy', '-hls_time', '2', '-hls_list_size', '0', str(media / 'content.m3u8')], check=True)
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(media / 'content.mp4'), '-c', 'copy', '-f', 'dash', str(media / 'content.mpd')], check=True, cwd=media)
assets = root / 'android/app/src/androidTest/assets'
assets.mkdir(parents=True, exist_ok=True)
for name in ['content', 'silent']:
    shutil.copyfile(media / f'{name}.mp4', assets / f'{name}.mp4')
