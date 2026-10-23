import type { Href } from 'expo-router';

import type { IconName } from '@/ui/components';

import { PRIVACY_EMAIL } from './hub';

/*
 * The in-app guide: every feature, what it's for, and how to use it, in plain words.
 * Each article opens like a Notion toggle. Screenshots are real screens with demo data only
 * (made-up names). Keep steps short: one tap per line.
 */

export const SHOTS = {
  welcome: require('../../assets/guide/welcome.jpg'),
  'welcome-team': require('../../assets/guide/welcome-team.jpg'),
  home: require('../../assets/guide/home.jpg'),
  'home-week': require('../../assets/guide/home-week.jpg'),
  schedule: require('../../assets/guide/schedule.jpg'),
  me: require('../../assets/guide/me.jpg'),
  players: require('../../assets/guide/players.jpg'),
  'team-join': require('../../assets/guide/team-join.jpg'),
  'team-join-sheet': require('../../assets/guide/team-join-sheet.jpg'),
  'team-mine': require('../../assets/guide/team-mine.jpg'),
  'team-mine-2': require('../../assets/guide/team-mine-2.jpg'),
  'game-new': require('../../assets/guide/game-new.jpg'),
  games: require('../../assets/guide/games.jpg'),
  events: require('../../assets/guide/events.jpg'),
  hats: require('../../assets/guide/hats.jpg'),
  hat: require('../../assets/guide/hat.jpg'),
  'hat-signup': require('../../assets/guide/hat-signup.jpg'),
  pickups: require('../../assets/guide/pickups.jpg'),
  calendar: require('../../assets/guide/calendar.jpg'),
  agm: require('../../assets/guide/agm.jpg'),
  announcements: require('../../assets/guide/announcements.jpg'),
  log: require('../../assets/guide/log.jpg'),
  'log-sheet': require('../../assets/guide/log-sheet.jpg'),
  development: require('../../assets/guide/development.jpg'),
  accreditation: require('../../assets/guide/accreditation.jpg'),
  registration: require('../../assets/guide/registration.jpg'),
  notifications: require('../../assets/guide/notifications.jpg'),
  account: require('../../assets/guide/account.jpg'),
  'access-request': require('../../assets/guide/access-request.jpg'),
  privacy: require('../../assets/guide/privacy.jpg'),
  feedback: require('../../assets/guide/feedback.jpg'),
  shoutouts: require('../../assets/guide/shoutouts.jpg'),
  hub: require('../../assets/guide/hub.jpg'),
} as const;

export type ShotKey = keyof typeof SHOTS;

export type Article = {
  id: string;
  title: string;
  /** Who it's for, if not everyone. */
  who?: string;
  /** Why the feature exists: one or two sentences. */
  why: string;
  steps?: string[];
  tips?: string[];
  shot?: ShotKey;
  open?: { label: string; href: Href };
};

export type GuideSection = { id: string; title: string; icon: IconName; articles: Article[] };

export const GUIDE: GuideSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    icon: 'rocket-launch-outline',
    articles: [
      {
        id: 'what',
        title: 'What is Ubuntu Ultimate?',
        why: 'One free app for the whole South African ultimate community. It started as a scoring app (replacing Stall Count) and now also runs your team’s week: practices, games, hats, pickups, leagues, news and your own development.',
        steps: [
          'Score any game, from a beach pickup to Nationals.',
          'Say if you’re coming to practices and games in one tap.',
          'Find pickups, hat tournaments, leagues and AGMs near you.',
          'Track your own games, training, gym and physio.',
        ],
        tips: ['It works without signal. Everything saves on your phone and syncs when you’re back online.', 'It’s a passion project by players, for players. No ads, ever.'],
        shot: 'welcome',
      },
      {
        id: 'setup',
        title: 'Set up in one minute',
        why: 'So the app opens on what matters to you: your team’s week, your region’s pickups and news.',
        steps: [
          'Open the app and tap Get started.',
          'Find your name (if your team already added you) or tap “I’m new: create my profile”.',
          'Tap the team(s) you play for.',
          'Tap your region on the map, or All of SA.',
          'Turn on reminders. Done!',
        ],
        tips: ['Skipped it? Me → “Set up step by step”, or change things one by one in Me.'],
        shot: 'welcome-team',
      },
      {
        id: 'around',
        title: 'Finding your way around',
        why: 'Four tabs at the bottom (top on the website), and your own page behind the round button at the top right.',
        steps: [
          'Home: your week (games, practices, pickups, hats, meetings), news and recent results. “For you” shows your teams and the ones you follow; switch to your region or All of SA.',
          'Games: start a game, see what’s live, coming up and finished, and tournaments & leagues.',
          'Teams: every club and team in SA, and Players (search and follow).',
          'Hub: pickups, hats, fields, calendar, announcements, links and rules.',
          'Me (round button, top right): your stats, schedule, log, teams, settings and help.',
        ],
        shot: 'home',
        open: { label: 'Open Home', href: '/' },
      },
      {
        id: 'account',
        title: 'Do I need an account?',
        why: 'No, to try it. Yes, to share with your team. Without an account everything stays on this phone only. With one, it’s backed up and your answers reach your captains.',
        steps: ['Me → Settings → Go online.', 'Create an account with your email and a password.', 'Pick which player you are. Your stats and teams follow you to any phone.'],
        tips: ['Your email is never shown to anyone.', 'Levels (scorekeeper, coordinator…) only stick once you’re signed in.'],
        shot: 'account',
        open: { label: 'Go online', href: '/account' },
      },
    ],
  },
  {
    id: 'team',
    title: 'You and your team',
    icon: 'account-group',
    articles: [
      {
        id: 'join',
        title: 'Join a team',
        why: 'Being on a team puts its games and practices in your schedule, and lets you answer “are you coming?”.',
        steps: [
          'Tap Teams, then find your team (search or browse by region).',
          'Open it and tap Join this team.',
          'Choose: I play for this team, Guest, or Pick-up for a tournament.',
          'If you’re signed in, the captain or coach approves it. You’ll get a notification.',
        ],
        tips: ['Waiting a while? The request shows on the team page. Give your captain a nudge on WhatsApp.', 'Your club isn’t listed? Teams → Add → Team.'],
        shot: 'team-join-sheet',
        open: { label: 'Find my team', href: '/teams' },
      },
      {
        id: 'schedule',
        title: 'My schedule: say if you’re coming',
        why: 'Captains plan lines, lifts and drills around who’s coming. One tap saves them a lot of WhatsApp messages.',
        steps: [
          'Me → My week → My schedule (or “My schedule” on Home).',
          'Each practice, game, pickup and meeting has Going, Late and Can’t.',
          'Late or Can’t? Add a short note, like “there by 7” or “injured”.',
          'The icon on the left shows what it is: whistle = game, runner = practice, people = pickup, hat = hat tournament, speaker = meeting.',
        ],
        tips: ['Hats you signed up for show here too. So do pickups you marked “I go here”, every week.', 'You get a reminder the day before a practice.'],
        shot: 'schedule',
        open: { label: 'Open my schedule', href: '/schedule' },
      },
      {
        id: 'checkin',
        title: 'Check in after a game or practice',
        why: 'A one-minute check-in tells your coaches how hard it was, any niggles, and what to work on, so they can plan and look after you.',
        steps: ['After the game or practice you get a notification (or open My schedule → How did it go?).', 'Answer what you want: everything is optional.', 'Tap Save.'],
        tips: ['Only your team’s staff see your answers, with your name.', 'It also fills your ultimate log.'],
      },
      {
        id: 'shoutouts',
        title: 'Shout-outs',
        why: 'A quick “well played” to a teammate. It’s nice to get, and coaches love seeing them.',
        steps: [
          'Give one: in the check-in after a game or practice, pick a teammate and say why.',
          'See the ones you got: Me → My week → Shout-outs.',
          'Your team’s recent ones are on the team page too.',
        ],
        tips: ['Only your squad sees shout-outs.'],
        shot: 'shoutouts',
        open: { label: 'My shout-outs', href: '/shoutouts' },
      },
      {
        id: 'follow',
        title: 'Follow teams, players and tournaments',
        why: 'Keep an eye on your partner, your friends’ teams or Nationals, without being on the team.',
        steps: [
          'Team: open it and tap Follow.',
          'Player: Teams → Players, search, and tap the star (or Follow on their page).',
          'Tournament or league: open it and tap Follow.',
          'Their games then show on Home under “For you”, e.g. “Sam playing”.',
        ],
        tips: ['Nobody is told who follows them.', 'Want their final scores as notifications? Me → Notifications → Results of teams you follow.'],
        shot: 'players',
        open: { label: 'Find players', href: '/teams' },
      },
    ],
  },
  {
    id: 'games',
    title: 'Scoring games',
    icon: 'whistle',
    articles: [
      {
        id: 'score',
        title: 'Score a game',
        why: 'Live scores and stats for everyone, and a game report for both teams afterwards.',
        steps: [
          'Home → Score a game.',
          'Pick the two teams (or create one), the division and the rules.',
          'Choose how much to track: Lite (scores and assists), Standard (adds turnovers and Ds) or Full (every pass).',
          'Do the disc flip: who pulls first, and the ratio for point 1.',
          'Tap who’s on the line, then PULL. Tap the scorer and assist when someone scores.',
          'Made a mistake? Undo, as many times as you need.',
          'Game over: End game & see report.',
        ],
        tips: [
          'New to scoring? Lite is easiest.',
          'Players can score friendlies and pickups. League and tournament games need a scorekeeper or team staff.',
          'Timeouts, halftime and injury subs are on the scoring screen. The app counts them down for you.',
        ],
        shot: 'game-new',
        open: { label: 'Score a game', href: '/game/new' },
      },
      {
        id: 'result',
        title: 'Just enter the result',
        why: 'For hats, pickups or when nobody scored live: record the final score, just who won, or only that it was played.',
        steps: ['Start a game and under “How much to track” pick Final score, Who won or No score.', 'Or open a fixture and tap “Just enter the result”.'],
      },
      {
        id: 'report',
        title: 'Live stats and game reports',
        why: 'See how the game is going and who’s playing well: holds, breaks, turnovers, goals and assists.',
        steps: ['While a game is live: See live stats.', 'After: open the game from Games → Finished, or Home → Recent results.', 'Share your game card from your stats page.'],
      },
      {
        id: 'spirit',
        title: 'Spirit scores',
        who: 'Captains and spirit captains',
        why: 'Spirit of the game is what makes ultimate ultimate. Leagues and tournaments collect a spirit score from both teams.',
        steps: ['After the game you get a reminder (2 hours after).', 'Open the game → Spirit, score the five areas and add a comment.'],
      },
      {
        id: 'events',
        title: 'Tournaments and leagues',
        why: 'Fixtures, results, standings and playoffs in one place, so nobody has to update a spreadsheet.',
        steps: ['Games → Tournaments & leagues.', 'Open one for its schedule, table and results.', 'Coordinators: tap + to create one, then add teams and generate or import the schedule.'],
        shot: 'events',
      },
    ],
  },
  {
    id: 'play',
    title: 'Pickups, hats and events',
    icon: 'map-marker-radius',
    articles: [
      {
        id: 'pickups',
        title: 'Find a pickup',
        why: 'Pickups are the easiest way to play more and meet people. New to ultimate? Start here.',
        steps: [
          'Hub → Find pickup (or Pickups on Home).',
          'Swipe or tap the days to flick through the week.',
          'Tap I go here on the ones you play: they show in your schedule every week, with Going or Can’t.',
          'WhatsApp group, Map and Call are on each card.',
        ],
        tips: ['Know a regular game that isn’t listed? Tap + to add it.', 'Want a reminder 2 hours before, or to hear about new pickups? Me → Notifications → Pickups (off until you turn it on).'],
        shot: 'pickups',
        open: { label: 'Find pickup', href: '/hub/pickups' },
      },
      {
        id: 'hat-join',
        title: 'Play in a hat tournament',
        why: 'Sign up on your own and get drawn into a balanced team. Great for meeting people and new players.',
        steps: [
          'Hub → Hat tournaments, and open the hat.',
          'Choose I’m in, Maybe or Can’t.',
          'Say if you’d captain. Your skill comes from your self-rating in your profile: haven’t done one in 6 months? Tap Rate myself first (two minutes).',
          'Pay: tap Pay, or use the EFT details and tap Send proof of payment.',
          'Tick I’ve paid. The organiser confirms it.',
          '48 hours before, paid players are drawn into teams. You get a notification with your team and the schedule.',
        ],
        tips: ['Only paid players are drawn. Late? You can still be added on the day without moving anyone.'],
        shot: 'hat-signup',
        open: { label: 'Hat tournaments', href: '/hat' },
      },
      {
        id: 'hat-host',
        title: 'Host a hat tournament',
        who: 'Coordinators',
        why: 'Replaces the Google Form, the spreadsheet and the WhatsApp chasing: sign-ups, payments, a fair draw and the schedule in one place.',
        steps: [
          'First get access: Me → Settings → Access level → Need more access? Pick Coordinator and say which hat and when. The admins approve it.',
          'Hub → Hat tournaments → Set up a hat.',
          'Fill in the name, date, times, place, cost, format (4v4, 5v5 or 7v7), game length and points.',
          'Payment: a pay link, EFT details, or both, plus where to send proof of payment (email or WhatsApp number).',
          'Save. Players in your region get a notification.',
          'As payments come in, tick them off on the hat page.',
          'Two days before: tap Draw. Pick the number of teams and fields, check the suggested captains, Draw, rename the teams to your shirt colours, and confirm.',
          'On the day: add late players. They go to the team that needs them most.',
        ],
        tips: ['Not happy with the teams? Draw again before you confirm.', 'You get a reminder 48 hours before to do the draw.'],
        shot: 'hat',
        open: { label: 'Ask for access', href: '/access' },
      },
      {
        id: 'calendar',
        title: 'Calendar, AGMs and meetings',
        why: 'Every big date in SA ultimate: Nationals, regionals, leagues, hats, AGMs and SGMs.',
        steps: [
          'Hub → Calendar. It opens on your region; national events always show.',
          'Open a meeting for the agenda and the Join meeting link.',
          'Tap Attending, Late or Send apologies. It goes in your schedule and you get reminders the evening before and 15 minutes before.',
        ],
        tips: ['Coordinators add entries with the +.'],
        shot: 'agm',
        open: { label: 'Open the calendar', href: '/hub/calendar' },
      },
      {
        id: 'news',
        title: 'Announcements',
        why: 'News from SAFDA and your region (Nationals dates, AGMs, constitution reviews) without digging through WhatsApp groups.',
        steps: ['The newest one is the dark strip on Home. Tap it for all of them.', 'Coordinators post them: Hub → Announcements → +.'],
        shot: 'announcements',
        open: { label: 'Announcements', href: '/hub/announcements' },
      },
      {
        id: 'fields',
        title: 'Fields',
        why: 'Where everyone plays, with directions. Games and weather use it too.',
        steps: ['Hub → Fields. Nearest first.', 'At a field that isn’t saved? Tap the pin button to save the one you’re on.'],
      },
    ],
  },
  {
    id: 'you',
    title: 'Your training and development',
    icon: 'chart-line',
    articles: [
      {
        id: 'log',
        title: 'My ultimate log',
        why: 'See how much you’re playing and training, so you can build up safely and avoid injuries.',
        steps: [
          'Me → My week → My ultimate log.',
          'Games you play are added automatically.',
          'Tap “Log a session” for practices, pickups, gym, physio or anything else.',
          'Answer the quick questions: how long, how hard, any niggles.',
        ],
        tips: ['Load = effort (1–10) × minutes. Your coaches see it as fitness dots when picking lines.'],
        shot: 'log-sheet',
        open: { label: 'My ultimate log', href: '/log' },
      },
      {
        id: 'rating',
        title: 'Self-rating every 6 months',
        why: 'See yourself grow, and help coaches and hat organisers make fair teams.',
        steps: [
          'Me → Playing → My development → Self-rating.',
          'Rate yourself 1 to 5 in five areas: game sense, throwing, cutting & catching, defence, and fitness.',
          'Every six months you get a nudge to do it again. Your history is kept.',
        ],
        tips: ['Be honest, not modest! Your team staff and coordinators can see it. Nobody else can.'],
        shot: 'development',
        open: { label: 'My development', href: '/development' },
      },
      {
        id: 'fitness',
        title: 'Fitness tests: why, and who sees them',
        why: 'Optional. They help you track your progress, and help coaches plan training and spot when someone is overdoing it. They are never used to judge you, never shared outside your team, and never sold.',
        steps: [
          'Me → Playing → My development → Fitness tests.',
          'Add a result: beep test, 5-10-5 agility, 40 m or 60 m sprint, with the date.',
          'Your personal bests and history show on the same page.',
        ],
        tips: ['Who sees them: you, your team’s staff and coordinators. Nobody else.', 'Don’t want to share? Just don’t add any. You can delete a result any time.'],
      },
      {
        id: 'accreditation',
        title: 'Accreditation',
        why: 'You need a valid WFDF rules accreditation to play leagues, regionals and Nationals. The app reminds you before it expires.',
        steps: ['Me → Playing → Accreditation.', 'Pick Standard or Advanced and add the expiry date.', 'Add a photo or PDF of your certificate.'],
        tips: ['Reminders 6 months, 1 month and 1 week before it runs out.', 'Staff see the level and expiry. The certificate itself stays on your phone.'],
        shot: 'accreditation',
        open: { label: 'My accreditation', href: '/accreditation' },
      },
      {
        id: 'membership',
        title: 'Membership numbers and fees',
        why: 'To play competitively you need to be paid up with SAFDA and your region. The app shows where to pay and whether you’re on the paid-up list.',
        steps: ['Me → Playing → Membership & fees.', 'Add your SAFDA and regional numbers and your WhatsApp number.', 'Use the links to register and pay.'],
        tips: ['Fees are due every year: you get a reminder on 1 February.', 'Your team staff and coordinators can see your numbers, so they can sort you out before a tournament.'],
        shot: 'registration',
        open: { label: 'Membership & fees', href: '/registration' },
      },
    ],
  },
  {
    id: 'staff',
    title: 'For captains and coaches',
    icon: 'clipboard-account-outline',
    articles: [
      {
        id: 'staff-what',
        title: 'What team staff can do',
        who: 'Captains, coaches, spirit captains, managers',
        why: 'Run your team in one place instead of five WhatsApp groups and a spreadsheet.',
        steps: [
          'Roster: add players, give roles (captain, coach…), approve join requests.',
          'Practices: schedule them, see who’s coming, take the register.',
          'Games: lines, confirming who played, spirit scores.',
          'Attendance, readiness (accreditation, fees), development and fitness for your squad.',
          'Export everything to a spreadsheet (CSV).',
        ],
        tips: ['Become staff: your current captain gives you the role on the team page. New team? Whoever creates it can manage it.'],
        shot: 'team-mine-2',
      },
      {
        id: 'practices',
        title: 'Schedule practices',
        who: 'Team staff',
        why: 'Players get an “are you coming?” the day before, and you see numbers before you plan the session.',
        steps: [
          'Open your team → Practices → Schedule.',
          'Set the day, time, field and how long. Turn on Repeat weekly for regular sessions.',
          'After practice, open it and take the register (it starts from who said they’re coming).',
        ],
        tips: ['Cancelling? Open the practice → Cancelled. Everyone who said they’re going gets told.'],
      },
      {
        id: 'requests',
        title: 'Approve people joining',
        who: 'Team staff',
        why: 'So random people can’t add themselves to your roster.',
        steps: ['You get a notification when someone asks.', 'Open your team: “Wants to join” is near the top.', 'Tap Add to team, or No.'],
      },
      {
        id: 'export',
        title: 'Export your data',
        who: 'Team staff and coordinators',
        why: 'For selections, funding applications or your own analysis in Excel or Google Sheets.',
        steps: ['Open your team (or a tournament) → Export data.', 'Pick what you want: games, player stats, points, every action, attendance, ratings, fitness, readiness.', 'Tap Share and send it to yourself.'],
        tips: ['Exports contain personal data. Keep them private and delete them when you’re done.'],
      },
    ],
  },
  {
    id: 'run',
    title: 'For coordinators and admins',
    icon: 'shield-account-outline',
    articles: [
      {
        id: 'levels',
        title: 'Access levels explained',
        why: 'Different people can do different things, so the data stays trustworthy.',
        steps: [
          'Player: score friendlies and pickups, join teams, edit your own details.',
          'Scorekeeper: score any game, including leagues and tournaments.',
          'Team staff: run their own team (roster, practices, lines, spirit).',
          'Coordinator: run leagues, tournaments, hats, the calendar and announcements.',
          'Admin: everything, and gives out levels.',
        ],
        tips: ['Need a level? Me → Settings → Access level → Need more access?'],
        shot: 'access-request',
        open: { label: 'My access level', href: '/access' },
      },
      {
        id: 'run-events',
        title: 'Run a league or tournament',
        who: 'Coordinators',
        why: 'Fixtures, live scores, tables and playoffs, updated as games are scored.',
        steps: [
          'Games → Tournaments & leagues → +.',
          'Name, dates, division, region and teams.',
          'Create the games: round robin (once, or twice home & away), within pools, Swiss rounds, or import a schedule.',
          'Scorekeepers and team staff score the games. Tables update by themselves.',
          'Playoffs: generate the bracket from the standings.',
        ],
      },
      {
        id: 'admin-tools',
        title: 'Paid-up lists, links and the inbox',
        who: 'Coordinators and admins',
        why: 'Keep the yearly admin in one place: who’s paid, where to register, and what players are asking for.',
        steps: [
          'Me → Admin → Paid-up lists: upload the SAFDA and regional member lists (CSV).',
          'Me → Admin → Forms & payment links: where players register and pay each year.',
          'Admins: Me → Admin → Bugs & ideas inbox, which also has access and privacy requests.',
        ],
        tips: ['Every Monday in January you get a reminder to update the links before fees open on 1 February.'],
      },
    ],
  },
  {
    id: 'data',
    title: 'Your data and privacy',
    icon: 'shield-lock-outline',
    articles: [
      {
        id: 'data-where',
        title: 'Where is my data stored?',
        why: 'You should always know where your information is and who can see it. We follow South Africa’s privacy law (POPIA).',
        steps: [
          'On your phone: everything is saved in a database on the phone, so the app works without signal.',
          'Online (only if you sign in): it’s copied to our database in a secure data centre in London (Supabase on Amazon Web Services). Every request is checked against who you are and what you may see.',
          'Backups: a nightly encrypted copy, so a mistake or outage can’t wipe the season.',
          'Never on the server: your certificate photos and profile photos stay on your phone.',
        ],
        tips: ['We never sell your data or show ads. The app is free, run by volunteers.'],
      },
      {
        id: 'data-who',
        title: 'Who can see what?',
        why: 'Most of ultimate is public (scores, stats, rosters). Personal things are only seen by the people who need them.',
        steps: [
          'Everyone: your name, number, position, teams, game stats and spirit scores.',
          'Your squad: shout-outs and who’s coming to practices and games.',
          'Your team staff and coordinators: accreditation level and expiry, membership numbers and fee status, WhatsApp number, self-ratings, fitness tests, and your check-in answers.',
          'Hat organisers (coordinators): your sign-up, skill number and payment for that hat.',
          'Only you: your email, date of birth, who you follow, and your account.',
          'Admins: bug reports and requests you send them.',
        ],
        tips: ['Under 18? Your date of birth is only used to protect you and is never shown.'],
      },
      {
        id: 'data-mine',
        title: 'Download, fix or delete my data',
        why: 'It’s your data. You can have a copy, correct it, or ask for it to be deleted at any time.',
        steps: [
          'Me → Settings → Your data & privacy.',
          'Download my data: one file with everything about you.',
          'Fix or delete: pick what you need, add details and tap Send to the admins. They reply within 30 days, usually much sooner.',
          `Prefer email? Write to ${PRIVACY_EMAIL}.`,
        ],
        tips: ['Most things you can fix yourself: Me → Edit profile.', 'Deleting removes your profile and personal details. Game scores stay (so other people’s stats still add up), with your name taken off.'],
        shot: 'privacy',
        open: { label: 'Your data & privacy', href: '/privacy' },
      },
    ],
  },
  {
    id: 'help',
    title: 'Help and feedback',
    icon: 'lifebuoy',
    articles: [
      {
        id: 'bugs',
        title: 'Report a bug or suggest an idea',
        why: 'The app gets better because of you. Every report goes straight to the people building it.',
        steps: [
          'Me → Help → Report a bug or suggest an idea.',
          'Choose Bug, New feature, Make it better or Other.',
          'Give it a short title, then what happened and what you expected.',
          'Tap Send. No signal? It sends later by itself.',
        ],
        tips: ['A screenshot helps: send it to the person who asked you to try the app.', 'Switch off “You can contact me” to send it anonymously.'],
        shot: 'feedback',
        open: { label: 'Report a bug', href: '/feedback' },
      },
      {
        id: 'notifs',
        title: 'Notifications: choose what you get',
        why: 'Helpful reminders without the spam. Every type can be turned off.',
        steps: ['Me → Settings → Notifications.', 'Switch each type on or off: game and practice reminders, check-ins, hats, meetings, news, fees and more.'],
        shot: 'notifications',
        open: { label: 'Notifications', href: '/notifications' },
      },
      {
        id: 'sync',
        title: 'Something isn’t showing up',
        why: 'Usually it’s just waiting for signal.',
        steps: [
          'Check Me → Settings → Account & sync: it says when it last synced and what’s waiting.',
          'Tap Sync now when you have signal.',
          'Not signed in? Then nothing leaves your phone. Go online to share with your team.',
          'Still stuck? Report a bug and say which screen.',
        ],
      },
      {
        id: 'who-ask',
        title: 'Who do I ask?',
        why: 'The right person gets things sorted fastest.',
        steps: [
          'Joining a team, practices, lines, roles: your team’s captain or coach.',
          'Hosting a hat, leagues, the calendar, coordinator access: the admins (Me → Settings → Access level → Need more access?).',
          'Fees, membership, accreditation courses: SAFDA or your regional association (Hub → Merch & links).',
          'Bugs and ideas: Me → Help → Report a bug.',
          `Privacy and your data: Me → Settings → Your data & privacy, or email ${PRIVACY_EMAIL}.`,
        ],
      },
    ],
  },
];

/** Flat list with its section, for search and deep links (/guide?topic=hat-host). */
export const ARTICLES = GUIDE.flatMap((s) => s.articles.map((a) => ({ ...a, section: s.id })));

export function searchGuide(q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const words = s.split(/\s+/);
  return ARTICLES.filter((a) => {
    const text = [a.title, a.who, a.why, ...(a.steps ?? []), ...(a.tips ?? [])].join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
