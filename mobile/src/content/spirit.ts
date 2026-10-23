/*
 * What each spirit score looks like, per category: condensed from the WFDF / USA Ultimate
 * Spirit of the Game score sheet examples (June 2021). Shown behind the (i) on the spirit screen.
 */

export const SPIRIT_SOURCE = 'Based on the WFDF / USA Ultimate Spirit of the Game score sheet examples (2021).';

export const SPIRIT_GUIDANCE = [
  '2 is the normal, average score. A typical good game is 10 out of 20; most games land between 8 and 13.',
  'Score as a team: talk it through together.',
  'Raise problems during the game, not just in the score. Your opponent shouldn’t be surprised by it.',
  'When in doubt, trust the other team. Not every example has to happen to earn a score.',
  'A 0 or a 4 needs a comment saying why. Comments aren’t public, but may be shared with the other team.',
];

type Cat = 'rules' | 'fouls' | 'fairness' | 'attitude' | 'communication';

export const SPIRIT_EXAMPLES: Record<Cat, { about: string; levels: [string[], string[], string[], string[], string[]] }> = {
  rules: {
    about: 'They followed the rules. When they didn’t know a rule, they made an effort to learn and apply it.',
    levels: [
      ['Repeatedly showed they didn’t know the rules for this level of play', 'Often ignored the rules', 'Kept ignoring feedback about the rules'],
      ['Sometimes didn’t know the rules for this level', 'Ignored the rules a few times', 'Resisted feedback or didn’t change'],
      ['Good rules knowledge for this level', 'Followed the rules', 'Asked when unsure about a rule or call, and took feedback on board'],
      ['Above-average rules knowledge', 'At least once offered to help us learn a rule (accepting is good spirit too)'],
      ['Excellent rules knowledge, even the fine details', 'Explained rules we didn’t know clearly, in a way that added to our knowledge and enjoyment'],
    ],
  },
  fouls: {
    about: 'They avoided dangerous plays and fouls, kept incidental contact to a minimum, and played safely.',
    levels: [
      ['Kept committing the same fouls after repeated calls', 'Dangerous or reckless plays, e.g. hitting a stationary player, diving at someone’s back or legs, contact to the head'],
      ['Contact noticeably affected play at times', 'At least one significant dangerous or reckless play'],
      ['No significant contact beyond incidental', 'Nobody played in a risky way', 'The game flowed without frequent fouls'],
      ['Actively avoided contact at least once', 'Played in a style that avoided fouls and unnecessary contact'],
      ['Avoided both fouls and unnecessary contact', 'Several clear decisions to avoid contact and keep others safe', 'Highest level of care and safety for how competitive it was'],
    ],
  },
  fairness: {
    about: 'Justifiable calls. They owned their mistakes and told teammates when their calls were wrong or unfair.',
    levels: [
      ['Always insisted their calls were right', 'Never gave an honest opinion when it might go against them', 'Many unjustifiable calls, gaming the rules (e.g. drawing fouls to reset the stall)', 'Unduly delayed the game'],
      ['Sometimes only saw things in their own favour', 'Inconsistent calls', 'Called lots of tiny breaches that didn’t affect play'],
      ['Only called things that affected the play', 'Acknowledged our view even when they disagreed', 'Owned up or apologised when appropriate, e.g. an uncontested foul'],
      ['At least once told a teammate their call was wrong or unnecessary', 'Adjusted their play after our feedback', 'Skipped trivial calls, like a tiny travel on an unmarked thrower'],
      ['Their first reaction to calls invited discussion', 'Several clear times they sought the truth even when it didn’t help them', 'Stayed fair and consistent in crunch moments like double game point'],
    ],
  },
  attitude: {
    about: 'Respectful and considerate whatever the score. Players and sideline worked towards a resolution in tense moments.',
    levels: [
      ['Players or sideline often used offensive language or slurs (racist, sexist, homophobic…) or gestures', 'Taunted opponents, confrontations on or off the field', 'Celebrations aimed at us, e.g. pointing after scoring on someone', 'Damaged or misused equipment', 'Rubbed in a skill gap, e.g. trick-play-only points'],
      ['Offensive language or gestures once or twice', 'Sometimes no restraint in tense moments', 'Sometimes taunted us after errors', 'One or two celebrations aimed at us, or misused equipment'],
      ['Generally showed restraint', 'Players and sideline listened in tense moments', 'Played with the right intensity whatever the score'],
      ['Left a good impression before, during or after the game', 'Several times clearly kept their cool', 'Complimented good plays by either team', 'Shared with us'],
      ['Took the lead to calm tense moments and keep the game flowing', 'Went out of their way so everyone enjoyed the game', 'Highest respect from start to finish'],
    ],
  },
  communication: {
    about: 'Respectful conversations: they listened to our side, kept discussions short, and used hand signals.',
    levels: [
      ['Often refused to discuss calls or issues', 'Often directed offensive language at others'],
      ['Players not involved in a play weighed in without being asked', 'Offensive language at others once or twice', 'Discussions about calls often dragged on'],
      ['Conflicts were sorted out without incident', 'Explained their view, and listened', 'Calls were settled quickly', 'Sometimes used official hand signals'],
      ['Communicated calls clearly to everyone, including sidelines', 'Used hand signals throughout', 'Introduced themselves and knew our team name', 'Raised spirit issues early, through their captains'],
      ['Clear, factual explanations for their calls', 'Listened, then asked follow-up questions', 'Pointed out specific examples of our good spirit'],
    ],
  },
};
