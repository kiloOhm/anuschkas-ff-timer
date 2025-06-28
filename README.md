# [Anuschka's FF Timer](https://anuschkas-ff-timer.vercel.app)

## Why does this exist?

My friend Anuschka moderates functional fitness competitions. She had the idea to pre-record voice cues for the teams' work and rest phases.

I thought that I could do better than that.

## Features

- Multi-Team timer with individual offsets, work-time, rest-time and round count
- Beep-Cues or Voice Cues per team
- Optional 5‑second warning beep in work phases
- Global color-coded phase overview with scrubber
- Synchronisation with read-only instances (for showing on multiple devices)
- Remote control
- Audio-Track generation for low-tech setups
- dark-/lightmode :)

## How to use

When the site loads, there is an overlay to inform you that sound is currently muted. All common web browser block audio output until manually requested with a user interaction. Just click or hit any key to unmute.

Most controls are hidden by default to make it nicer to look at on a shared screen. Press and hold CTRL to show all hidden buttons

### Resume/Pause/Reset

- Click on the resume/pause icon in the top left or hit the space bar to resume/pause
- Click on the hidden RESET button to the right of the resume/pause icon or hit R on your keyboard to reset
- Hit P on your keyboard to pause

### Settings

- Click on a timer to expand/collapse the settings for it
- Click the hidden (-) button to the right of a timer to remove it
- Click the hidden (+) button below the last timer to add a new one
- There is a hidden button, bottom center of the screen to restore the default config

### Scrubbing

- Click (and drag) on the global timeline in the header to scrub to a specific time
- Press (and hold) the left or right ARROW key to skip ahead or rewind by 1s. Hold down shift at the same time to skip by 10s.

### Sync

- Click on the hidden sync button in the bottom right corner to show the sync options
- Scan the QR code or click "copy remote url" for remote control. Controls are analogous to resume/pause/reset
- Click "copy follower url" and paste it into a DIFFERENT browser context (different browser or incognito mode) to open a synchronised read-only version
- If the current instance is in follower mode, there will also be a button to manually take over lead
- When the lead instance disconnects, one of the followers takes over to ensure continuity
- You can switch to offline mode if you want to make sure that nobody sneakily remote controls your session

There are three little color-coded indicators in the bottom right corner:
- Connection to sync server
- Mode (green = lead, yellow = follower, blue = remote)
- Remote (if lead/follower [yellow = no remote present, green = remote connected], if remote [red = no lead present, green = connected to lead])

Sync is facilitated via a free-tier ably account. Pls don't max out my Quota, or I'll have to implement auth.

### Audio-Track Generation

- Click the hidden audio button in the bottom left corner. Encoding will take a while. The tab might become unresponsive during this process. I might optimize this in the future if needed.

### Dark-/Lightmode

- As usual, there is a hidden button in the top right corner
