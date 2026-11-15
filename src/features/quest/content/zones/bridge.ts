// src/features/quest/content/zones/bridge.ts
//
// Zone 3, The Bridge: while, for, do-while, nested loops and patterns (#981).
//
// These six quests are the worked examples for the content schema: one of each
// quest type, both grading modes, and a boss. Copy the nearest one when writing
// a new quest. Reference solutions live beside this file in
// bridge.solutions.ts, which the app never imports.
//
// The order matters twice over. A quest can only require quests listed before
// it, and the first quest is deliberately one that needs no Java engine, so a
// student on mobile data is playing before anything large is downloaded.

import type { ZoneInput } from '../schema.ts';

export const bridge: ZoneInput = {
  id: 'bridge',
  order: 3,
  name: 'The Bridge',
  tagline: 'Nobody crosses by counting planks one at a time.',
  topics: ['while', 'for', 'do-while', 'nested loops', 'patterns'],
  status: 'open',
  map: 'bridge',
  giver: { name: 'Karim Majhi' },
  quests: [
    // ── Predict the output ──────────────────────────────────────────────────
    {
      id: 'bridge-count-the-planks',
      type: 'predict',
      title: 'Count the Planks',
      story: [
        'So you want to cross. Forty years I have kept this bridge, and every traveller is in a hurry.',
        'First show me you can read a loop. My apprentice wrote this to check the planks. Tell me exactly what it prints.',
      ],
      task: 'Trace the code by hand and type exactly what it prints, line by line.',
      concepts: ['for', 'loop counter', 'tracing'],
      xp: 20,
      snippet: `int planks = 0;
for (int i = 1; i <= 10; i += 3) {
    planks++;
    System.out.print(i + " ");
}
System.out.println();
System.out.println("planks = " + planks);`,
      answer: `1 4 7 10
planks = 4`,
      explanation:
        'i starts at 1 and goes up by 3: 1, 4, 7, 10. The next value, 13, fails i <= 10, so the body ran 4 times. print keeps the numbers on one line; the empty println ends it.',
      hints: [
        'Make a table with two columns, i and planks, and fill in one row per trip round the loop.',
        'The loop adds 3 each time, not 1. Which values of i are still <= 10?',
      ],
    },

    // ── Command the hero ────────────────────────────────────────────────────
    {
      id: 'bridge-first-span',
      type: 'hero',
      title: 'The First Span',
      story: [
        'Good. Now the first span. Walk to the far post, and bring me the three lanterns someone left on the planks.',
        'I will not tell you how many planks there are. I never counted, and neither should you.',
      ],
      task: 'Walk the hero to the far end of the span and pick up every lantern on the way. Use a loop: you may write hero.step() only once.',
      concepts: ['while', 'loop condition', 'if inside a loop'],
      xp: 40,
      requires: ['bridge-count-the-planks'],
      level: {
        grid: ['#########', 'S.*..*.*G', '#########'],
        facing: 'E',
      },
      goal: { reach: true, collectAll: true },
      rules: [
        {
          kind: 'atMost',
          token: 'hero.step(',
          max: 1,
          message: 'Write hero.step() only once and let a loop repeat it.',
        },
        {
          kind: 'requires',
          anyOf: ['while', 'for'],
          message: 'This span needs a loop. Try while (hero.frontIsClear()) { ... }',
        },
      ],
      starter: `public class Main {
    public static void main(String[] args) {
        Hero hero = new Hero();

        // hero.step()          walk one plank forward
        // hero.pick()          pick up a lantern
        // hero.frontIsClear()  true if the next plank is there
        // hero.onItem()        true if a lantern is on this plank

        hero.step();
    }
}
`,
      hints: [
        'hero.frontIsClear() is true while there is a plank ahead. That is a loop condition.',
        'Inside the loop: step, then check hero.onItem() with an if, and pick when it is true.',
      ],
    },

    // ── Fill in the missing line ────────────────────────────────────────────
    {
      id: 'bridge-the-toll',
      type: 'fill',
      title: 'The Toll',
      story: [
        'There is a toll. Travellers keep trying to pay me nothing, or less than nothing.',
        'My toll box asks again and again until it hears a real amount. One line has worn away. Carve it back.',
      ],
      task: 'The program must keep reading numbers until it reads one greater than 0, then print it. Write the one missing line.',
      concepts: ['do-while', 'input validation'],
      xp: 30,
      requires: ['bridge-count-the-planks'],
      template: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int toll;
        do {
            toll = sc.nextInt();
__BLANK__
        System.out.println("Toll paid: " + toll);
    }
}
`,
      grading: {
        mode: 'stdio',
        tests: [
          { name: 'Pays at once', stdin: '7\n', expected: 'Toll paid: 7\n' },
          { name: 'Tries a negative, then zero', stdin: '-3\n0\n5\n', expected: 'Toll paid: 5\n' },
          {
            hidden: true,
            stdin: '0\n0\n-1\n12\n99\n',
            expected: 'Toll paid: 12\n',
            hint: 'Zero is not a payment either. And once a real amount arrives, stop reading.',
          },
        ],
      },
      hints: [
        'A do-while ends with a closing brace, the word while, a condition in brackets, and a semicolon.',
        'The loop should go round again while the toll is NOT acceptable. Which values are not acceptable?',
      ],
    },

    // ── Fix the bug ─────────────────────────────────────────────────────────
    {
      id: 'bridge-rope-counter',
      type: 'fix',
      title: 'The Rope Counter',
      story: [
        'Each plank hangs from ropes: plank 1 from one rope, plank 2 from two, and so on. I need the total for n planks.',
        'My apprentice wrote this counter. I started it yesterday. It is still running. Find out why, and mend it.',
      ],
      task: 'The program reads n and should print 1 + 2 + ... + n. It has two bugs. Fix both. Run it first to see what happens.',
      concepts: ['while', 'infinite loop', 'off-by-one'],
      xp: 40,
      requires: ['bridge-count-the-planks'],
      starter: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int total = 0;
        int i = 1;
        while (i < n) {
            total = total + i;
        }
        System.out.println(total);
    }
}
`,
      grading: {
        mode: 'stdio',
        tests: [
          { name: 'Five planks', stdin: '5\n', expected: '15\n' },
          { name: 'One plank', stdin: '1\n', expected: '1\n' },
          {
            hidden: true,
            stdin: '100\n',
            expected: '5050\n',
            hint: 'Is the last plank being counted? Trace n = 3 by hand.',
          },
          { hidden: true, stdin: '0\n', expected: '0\n' },
        ],
      },
      hints: [
        'A loop that never ends is a loop whose condition never becomes false. What changes i?',
        'With n = 5 the answer should include 5 itself. Look hard at the comparison.',
      ],
    },

    // ── Write code ──────────────────────────────────────────────────────────
    {
      id: 'bridge-plank-strength',
      type: 'write',
      title: 'Plank Strength',
      story: [
        'Every plank is stamped with a number. The carpenters say a plank is as strong as the sum of its digits. Carpenters say many things.',
        'Still, I must log the strengths. The first line is Workshop craft you will learn later. Leave it alone and write the loop inside.',
      ],
      task: 'Complete digitSum so it returns the sum of the digits of n. For example digitSum(1234) is 10. n is never negative.',
      concepts: ['while', '% and /', 'accumulator'],
      xp: 50,
      requires: ['bridge-the-toll', 'bridge-rope-counter'],
      starter: `public class Solution {
    public static int digitSum(int n) {
        int sum = 0;
        // n % 10 is the last digit. n / 10 removes it.

        return sum;
    }
}
`,
      grading: {
        mode: 'method',
        method: { name: 'digitSum', params: [{ type: 'int', name: 'n' }], returns: 'int' },
        tests: [
          { name: 'digitSum(1234)', args: [1234], expected: 10 },
          { name: 'digitSum(7)', args: [7], expected: 7 },
          { name: 'digitSum(0)', args: [0], expected: 0 },
          { hidden: true, args: [99999], expected: 45 },
          {
            hidden: true,
            args: [1000000],
            expected: 1,
            hint: 'Zeros are digits too. Does your loop stop too early, or too late?',
          },
        ],
      },
      rules: [
        {
          kind: 'requires',
          anyOf: ['while', 'for', 'do'],
          message: 'You do not know how many digits n has, so this needs a loop.',
        },
      ],
      hints: [
        'Take the last digit with n % 10 and add it to sum. Then throw it away with n = n / 10.',
        'Keep going while there are digits left: while (n > 0).',
      ],
    },

    // ── Boss: nested-loop pattern ───────────────────────────────────────────
    {
      id: 'bridge-keystone',
      type: 'write',
      boss: true,
      title: 'The Keystone Arch',
      story: [
        'You have reached the middle, where the old arch fell. The masons left a drawing of how the stones were numbered.',
        'Rebuild it for any height I ask and the far gate is yours. Every stone and every gap must be exactly in its place.',
      ],
      task: 'Read n (1 to 9). Print an arch of n rows: row r has n - r spaces, then the numbers 1 up to r, then back down to 1. For n = 3:\n\n  1\n 121\n12321',
      concepts: ['nested loops', 'patterns', 'for'],
      xp: 120,
      requires: ['bridge-first-span', 'bridge-plank-strength'],
      starter: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();

    }
}
`,
      grading: {
        mode: 'stdio',
        tests: [
          { name: 'n = 3', stdin: '3\n', expected: '  1\n 121\n12321\n' },
          { name: 'n = 1', stdin: '1\n', expected: '1\n' },
          { name: 'n = 4', stdin: '4\n', expected: '   1\n  121\n 12321\n1234321\n' },
          {
            hidden: true,
            stdin: '2\n',
            expected: ' 1\n121\n',
            hint: 'Check the spaces before each row. Row r needs n - r of them.',
          },
          {
            hidden: true,
            stdin: '9\n',
            expected:
              '        1\n       121\n      12321\n     1234321\n    123454321\n   12345654321\n  1234567654321\n 123456787654321\n12345678987654321\n',
          },
        ],
      },
      rules: [
        {
          kind: 'requires',
          anyOf: ['for', 'while'],
          message: 'An arch of any height needs loops, one inside another.',
        },
      ],
      hints: [
        'One outer loop for the rows. Inside it, three small loops in a row: spaces, counting up, counting down.',
        'Row r: print n - r spaces, then 1 to r, then r - 1 down to 1, then a new line.',
        'Use print for the pieces of a row and a single println to end it.',
      ],
    },
  ],
};
