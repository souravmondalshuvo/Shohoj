// src/features/quest/content/zones/bridge.solutions.ts
//
// Reference solutions for The Bridge, keyed by quest id (#981).
//
// Nothing in the app imports this file, so it is not in what a student
// downloads. It exists for the tests and for the author's check that every
// quest can be solved: a `write`, `fix` or `hero` entry is the whole file the
// student would submit, a `fill` entry is the one missing line, and a `predict`
// entry is what they would type.

export const bridgeSolutions: Readonly<Record<string, string>> = {
  'bridge-count-the-planks': `1 4 7 10
planks = 4`,

  'bridge-first-span': `public class Main {
    public static void main(String[] args) {
        Hero hero = new Hero();
        while (hero.frontIsClear()) {
            hero.step();
            if (hero.onItem()) {
                hero.pick();
            }
        }
    }
}
`,

  'bridge-the-toll': '} while (toll <= 0);',

  'bridge-rope-counter': `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int total = 0;
        int i = 1;
        while (i <= n) {
            total = total + i;
            i++;
        }
        System.out.println(total);
    }
}
`,

  'bridge-plank-strength': `public class Solution {
    public static int digitSum(int n) {
        int sum = 0;
        while (n > 0) {
            sum += n % 10;
            n = n / 10;
        }
        return sum;
    }
}
`,

  'bridge-keystone': `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        for (int row = 1; row <= n; row++) {
            for (int s = 0; s < n - row; s++) {
                System.out.print(" ");
            }
            for (int k = 1; k <= row; k++) {
                System.out.print(k);
            }
            for (int k = row - 1; k >= 1; k--) {
                System.out.print(k);
            }
            System.out.println();
        }
    }
}
`,
};
