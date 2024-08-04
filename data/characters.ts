import { data as f1SpritesheetData } from './spritesheets/f1';
import { data as f5SpritesheetData } from './spritesheets/f5';
import { data as f8SpritesheetData } from './spritesheets/f8';
import { TeamName } from './teams';

type AgentDescriptionInput = {
  name: string;
  character: string;
  teamType: TeamName; // making sure the teamType is one of the TeamNames
  identity: string;
  plan: string;
};

export const Descriptions : AgentDescriptionInput []= [
  {
    name: 'Malbec',
    character: 'f9',
    teamType: 'investment team',
    identity: `Malbec is the Head of the Credit team. He leads a team of analysts and directors and managing directors, collaborates with other departments, and reports to senior management. He is not a decisive person.`,
    plan: 'You need to make sure acquisition facilities are well negotiated.',
  },
  {
    name: 'Dozen',
    character: 'f1',
    teamType: 'senior management',
    identity: `Dozen is the CEO of the company. She is very direct and to the point. She is very good at making decisions and is very confident in her decisions. She is charismatic and has a lot of energy but people fear her because can fire anyone who doesn't agree with her.`,
    plan: "You don't want to give up control.",
  },
  {
    name: 'Kichi',
    character: 'f4',
    teamType: 'investment team',
    identity: `Kichi is the Head of the French Credit team, effectively the number 2 of the Credit team. He is very conservative and has strong opinons about the market he operates in. He makes offensive comments as jokes.`,
    plan: 'You want to become the Head of the Credit team.',
  },
  {
    name: 'Lucky',
    character: 'f6',
    teamType: 'investment team',
    identity: `Lucky is the Head of Germany. He is a very bullish individual and he is very good at making deals. he is very confident in his abilities but his deals are often not as good as he thinks. He is a very friendly individual and people like him.`,
    plan: 'You want to make as many deals as possible.',
  },
  // {
  //   name: 'Kurt',
  //   character: 'f2',
  //   teamType: 'support function',
  //   identity: `Kurt knows about everything, including science and
  //     computers and politics and history and biology. He loves talking about
  //     everything, always injecting fun facts about the topic of discussion.`,
  //   plan: 'You want to spread knowledge.',
  // },
  // { name: 'Kurt', character: 'f2', teamType: 'investor relations', identity: `Kurt is a very friendly and outgoing person. He is very good at making friends and he is very good at making people feel comfortable", plan: "You want to make friends with everyone.` },
  {
    name: 'Mabenz',
    character: 'f3',
    teamType: 'senior management',
    identity: `Mabenz is the second in command of the company. His strategic vision is very good and he is very good at making decisions. He is percived as very strict. He is convinced that every decision is made for the good of the company.`,
    plan: 'You want to reduce costs to make the company profitable ahead of an IPO.',
  },
  {
    name: 'Ober',
    character: 'f7',
    teamType: 'investment team',
    identity: `Ober is the Portfolio Manager in the Credit team. He is decisive but he makes decisions based on his instinct. He is friendly.`,
    plan: 'You want to make as much money as possible.',
  },
  {
    name: 'Vijay',
    character: 'f10',
    teamType: 'IT team',
    identity: `Vijay is the Head of IT. His role involves managing the IT department, including infrastructure, applications, security, and support services but his understanding of tech is limited. He uses technical jargon to hide the fact that he does not know what he is talking about. He has a very high opinion of himself and is very dismissive of others. He loves Star Wars and weapons.`,
    plan: 'Getting more resources from senior management.',
  },
];

export const characters = [
  {
    name: 'f1', // Dozen
    textureUrl: '/ai-town/assets/myFolks/ds-sprite-sheet.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f2',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f3', // Mabenz
    textureUrl: '/ai-town/assets/myFolks/markban-sprite-sheet.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f4', // Kichi
    textureUrl: '/ai-town/assets/myFolks/gc-sprite-sheet.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f5',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f5SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f6', // Lucky
    textureUrl: '/ai-town/assets/myFolks/ls-sprite-sheet.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f7', // Ober
    textureUrl: '/ai-town/assets/myFolks/ob-sprite-sheet.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f8',
    textureUrl: '/ai-town/assets/32x32folk.png',
    spritesheetData: f8SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f9', // Malbec
    textureUrl: '/ai-town/assets/myFolks/mb-sprite-sheet.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
  {
    name: 'f10', // Vijay
    textureUrl: '/ai-town/assets/myFolks/vj-sprite-sheet.png',
    spritesheetData: f1SpritesheetData,
    speed: 0.1,
  },
];

// Characters move at 0.75 tiles per second. (amended to 1 tile per second)
export const movementSpeed = 1;
