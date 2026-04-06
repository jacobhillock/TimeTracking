# Open Close Reminders

I want the ability to add popups for open/close reminders in the app. This is to remind me to send an open/close email to my management about what I am going to do and what I did, and what I will do tomorrow.

## Requirements

1. I want to set a time for the reminders in settings
   1. OpenReminderTime = default null/undefined
   2. CloseReminderTime = default null/undefined
2. If the open/close reminder time is populated and the current time is passed that time, open a modal that say "reminder: send [open/close] email"
3. That should only happen once a day for each variable and shouldn't occur after a refresh. if the time is changed then that can be reset
   1. eg. OpenReminderTime = 8:30
   2. I open app at 8:29
      1. no popup
   3. time changes to 8:30
      1. pop up
   4. close popup
   5. refresh tab at 8:31
   6. no popup

## Questions:

Put your questions below here. If you have no questions, do not update the file, re-review it and double check if there are any more questions, if still no and say "ready".

### 1. Reminder time already passed on open

If the app is opened after the reminder time has already passed (or the time is set to a past time), should the modal show immediately?

**yes**

### 2. "Once per day" reset rule

Should the once-per-day reset be based on the local day boundary (same `dateKey` logic used elsewhere)?

**yes**

### 3. Settings location

Where should the reminder time fields live in the UI — existing settings section, or a new settings modal/area?

**existing is fine**

### 4. Time input format

Preferred input format: 24-hour `HH:mm` (like other times), or a time picker?

**24 hour is fine but it uses a time picket already elsewhere. Use exsting patterns**

### 5. Modal actions

Should the modal be a simple dismiss/close, or include an explicit “don’t show again today” action?

**dismiss/close**

### 6. Both reminders at same time

If open and close reminder times are the same (or overlap), should the app show two modals sequentially, combine them into one, or show only one?

**open both separately. don't make it complicated**

### 7. Changing time to a past value

If a reminder time is changed to a time that is already in the past for today (e.g., set to 08:30 at 09:00), should it trigger immediately?

**if the time has changed, treat it like it was never opened that day. It should trigger if the time is now or has passed**

### 8. Clarify past-time change behavior

Your answer sounds like there is a cutoff (e.g., “if it is 8:45 no, if it is after 9:00 then yes”). What exact rule should the app follow when the reminder time is changed to a past time?

**if the time has changed, treat it like it was never opened that day. It should trigger if the time is now or has passed**

### 9. Where to persist "already shown today"

Should the “already shown today” state be stored in `localStorage` (like pinned tickets) or in IndexedDB?

**local storage is fine. maybe like "lastOpenTimeNotification"/"lastOpenCloseNotification" to the datekey and these values are reset when the times are changed**

### 10. App left open across midnight

If the app stays open across a day boundary, should the reminder reset at local midnight and be eligible to show again without requiring a refresh?

**yes**

### 0. Example question summary

This is an example question about the requirements

**example answer to question 0**
