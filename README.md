# TODO

## unify cue schedulung

## offload mp3 encoding to webworker

## add beep option

## rework timer data

## rework sync

### time should be tracked with higher precision, for sync

### Timer Flow:
1. Timer starts up
2. Establishes connection to ably
  - if connection fails, enters local mode (leadtimer behavior without sync)
3. enters presence as followtimer
4. fetches all other timers from presence
  - if no other timers, upgrade to leadtimer
  - if other leadtimer, remain followtimer
  - if other followtimer, determine priority based on clientId and upgrade to leadtimer if prio
5. if leadtimer, sync state and config
when current leadtimer leaves, redo step 4 
when state changes, sync
when config changes, sync
when remote connects, show user
6. when signal (resume, pause, reset) is received from remote, apply and sync state

### Remote Flow:
1. Remote starts up
2. Checks if sessionid was provided
  - if not, show error
3. Establishes connection to ably
  - if connection fails, show error
4. Fetches lead timer from presence
  - if no lead timer is found, show error
when lead timer enters, remove error
when state is synced, update state