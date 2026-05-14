export const APP_NAMES = {
  'code.exe': 'VS Code',
  'chrome.exe': 'Chrome',
  'discord.exe': 'Discord',
  'spotify.exe': 'Spotify',
  'firefox.exe': 'Firefox',
  'msedge.exe': 'Edge',
  'opera.exe': 'Opera',
  'slack.exe': 'Slack',
  'figma.exe': 'Figma',
  'notepad.exe': 'Notepad',
  'notepad++.exe': 'Notepad++',
  'winword.exe': 'Word',
  'excel.exe': 'Excel',
  'powerpnt.exe': 'PowerPoint',
  'teams.exe': 'Teams',
  'zoom.exe': 'Zoom',
  'obs64.exe': 'OBS',
  'vlc.exe': 'VLC',
  'postman.exe': 'Postman',
  'dbeaver.exe': 'DBeaver',
};

export function buildSuggestedName(windows) {
  const seen = new Set();
  const names = [];
  for (const w of windows) {
    const proc = (w.process_name || '').toLowerCase();
    if (!proc) continue;
    const friendly = APP_NAMES[proc] ||
      proc.replace(/\.exe$/i, '').replace(/^([a-z])/, c => c.toUpperCase());
    if (!seen.has(friendly)) {
      seen.add(friendly);
      names.push(friendly);
    }
  }
  if (!names.length) return '';
  const shown = names.slice(0, 3);
  const extra = names.length - 3;
  return extra > 0 ? `${shown.join(' + ')} + ${extra} more` : shown.join(' + ');
}
