# Tasbeeh-e-Fatema — iPhone Widget & Counter

A [Scriptable](https://scriptable.app) script that gives you:

- 📿 **A tap counter** that cycles through the Tasbeeh of Fatima az-Zahra (ﷺ):
  | Order | Dhikr | Count |
  |------:|-------|------:|
  | 1 | **Allāhu Akbar** (اللّٰهُ أَكْبَر) | 33 |
  | 2 | **Alhamdulillāh** (اَلْحَمْدُ لِلّٰه) | 33 |
  | 3 | **SubḥānAllāh** (سُبْحَانَ اللّٰه) | 33 |
  | 4 | **Lā ilāha illā Allāh** (لَا إِلٰهَ إِلَّا اللّٰه) | 1 |

  It auto-advances between phrases, shows a progress ring, and resets when the
  cycle is complete.
- 🏠 **A Home Screen widget** you can pull out anytime — shows the 33·33·33·1
  breakdown, how many cycles you've done today, and your next prayer time.
  Tap it to jump straight into the counter.
- 🕌 **Prayer reminders** at all 5 daily prayer times (calculated automatically
  from your GPS location) nudging you to recite tasbeeh after each salah.

---

## Install (5 minutes, no Mac needed)

1. **Install Scriptable** from the App Store (free):
   https://apps.apple.com/app/scriptable/id1405459188

2. **Add the script:**
   - Open Scriptable → tap the **＋** in the top-right.
   - Delete the placeholder text.
   - Open [`TasbeehFatema.js`](./TasbeehFatema.js), copy **all** of it, and
     paste it in.
   - Tap **Done**. Rename the script to **Tasbeeh-e-Fatema** if you like
     (tap the title).

3. **Grant permissions** — the first time you run it, iOS will ask for:
   - **Location** → choose *Allow While Using* (used to calculate prayer times).
   - **Notifications** → *Allow* (used for the prayer reminders).

   > Tip: run the script once from inside Scriptable first (tap ▶) so it can
   > fetch your location and schedule reminders.

4. **Add the Home Screen widget:**
   - Long-press an empty area of your Home Screen → tap **＋** (top-left).
   - Search for **Scriptable** → pick a **Small** widget → **Add Widget**.
   - Long-press the new widget → **Edit Widget**.
   - Set **Script** to *Tasbeeh-e-Fatema* and **When Interacting** to
     *Run Script*.
   - Done — tap the widget anytime to open the counter.

---

## Using it

- **Tap anywhere** on the counter screen to count. It moves you through each
  phrase automatically and celebrates when a full cycle is finished.
- **Undo** fixes a miscount; **Reset** starts the cycle over.
- Progress and your daily cycle count are saved automatically.
- Reminders refresh every time you open the script, so just opening it now and
  then keeps the next few days of prayer alerts scheduled.

---

## Customising

Everything tweakable lives at the top of `TasbeehFatema.js`:

- **Counts / order** — edit the `PHASES` array. For the traditional
  34 / 33 / 33 distribution, set the takbir `count` to `34` and remove the
  `tahlil` entry.
- **Prayer calculation method** — `CALC_METHOD`. Defaults to **0 = Shia
  Ithna-Ashari (Jafari)**. Use `2` for ISNA, `3` for Muslim World League, etc.
  Full list: https://aladhan.com/calculation-methods
- **How many days of reminders** to schedule ahead — `REMINDER_DAYS`.

Prayer times are fetched from the free [Aladhan API](https://aladhan.com/prayer-times-api).
No API key required.
