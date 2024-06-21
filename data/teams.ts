export const Teams = [
    {
        name: 'investment team', 
        hq:{
            x: 0,
            y: 0
        },
        description: 'The investment team is responsible for making investment decisions, managing the portfolio, and raise funds together with the Investor Relations team.',
    },
    {
        name: 'support function',
        hq:{
            x: 0,
            y: 10
        },
        description: 'The support function team is responsible for providing support to the investment team for the administration of the funds.',
    },
    {
        name: 'IT team',
        hq:{
            x: 10,
            y: 0
        },
        description: 'The IT team is responsible for managing the IT infrastructure, applications, security, and support services.',
    },
    {
        name: 'investor relations',
        hq:{
            x: 10,
            y: 10
        },
        description: 'The investor relations team is responsible for raising funds from investors and managing the relationship with them. They work closely with the investment team and support function team.',
    },
    {
        name: 'senior management',
        hq:{
            x: 5,
            y: 5
        },
        description: 'The senior management team is responsible for setting the strategy and direction of the firm.',
    }
  ];

  export type TeamName = typeof Teams[number]['name'];