import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, query } from './connection';

// ============================================================
// Markdown Helper Template
// ============================================================
function makeDescription(
  statement: string,
  constraints: string[],
  inputFormat: string[],
  outputFormat: string,
  sample1: { input: string; output: string; explanation?: string },
  sample2: { input: string; output: string; explanation?: string }
): string {
  const constraintsMd = constraints.map(c => `- ${c}`).join('\n');
  const inputMd = inputFormat.map(i => `- ${i}`).join('\n');
  const sample1Exp = sample1.explanation ? `\n**Explanation:** ${sample1.explanation}` : '';
  const sample2Exp = sample2.explanation ? `\n**Explanation:** ${sample2.explanation}` : '';

  return `### Problem Statement
${statement}

### Constraints
${constraintsMd}

### Input Format
${inputMd}

### Output Format
- ${outputFormat}

### Sample 1
**Input:**
\`\`\`
${sample1.input}
\`\`\`
**Output:**
\`\`\`
${sample1.output}
\`\`\`${sample1Exp}

### Sample 2
**Input:**
\`\`\`
${sample2.input}
\`\`\`
**Output:**
\`\`\`
${sample2.output}
\`\`\`${sample2Exp}`;
}

// ============================================================
// Shared Descriptions and Test Cases for 10 Questions
// ============================================================

const DESCRIPTIONS = [
  // Q1
  makeDescription(
    'Given an array of N integers, calculate and print the sum of all elements.',
    ['1 <= N <= 100', '-1000 <= arr[i] <= 1000'],
    ['First line contains integer N (size of the array).', 'Second line contains N space-separated integers.'],
    'Print a single integer representing the sum of all array elements.',
    { input: '5\n1 2 3 4 5', output: '15', explanation: '1 + 2 + 3 + 4 + 5 = 15.' },
    { input: '4\n10 -5 20 -15', output: '10', explanation: '10 + (-5) + 20 + (-15) = 10.' }
  ),
  // Q2
  makeDescription(
    'Given an array of N integers (which may include negative numbers and duplicates), find and print the maximum value.',
    ['1 <= N <= 100', '-10000 <= arr[i] <= 10000'],
    ['First line contains integer N.', 'Second line contains N space-separated integers.'],
    'Print the maximum value found in the array.',
    { input: '5\n-8 -3 -12 -1 -5', output: '-1', explanation: 'The largest number among all negatives is -1.' },
    { input: '4\n7 22 9 14', output: '22', explanation: '22 is greater than 7, 9, and 14.' }
  ),
  // Q3
  makeDescription(
    'Given an array of N integers, count and print the total number of even integers present. Note that 0 and negative even numbers are also even.',
    ['1 <= N <= 100', '-10000 <= arr[i] <= 10000'],
    ['First line contains integer N.', 'Second line contains N space-separated integers.'],
    'Print the count of even numbers in the array.',
    { input: '6\n1 2 3 4 5 6', output: '3', explanation: 'The even numbers are 2, 4, and 6.' },
    { input: '5\n-2 -3 -4 0 7', output: '3', explanation: 'The even numbers are -2, -4, and 0.' }
  ),
  // Q4
  makeDescription(
    'Given a non-empty string consisting of lowercase English letters, determine if it is a palindrome. Print YES if it reads the same backwards, otherwise print NO.',
    ['1 <= length of string <= 100', 'String contains only lowercase English alphabets without spaces.'],
    ['A single line containing the string S.'],
    'Print YES if the string is a palindrome, otherwise print NO.',
    { input: 'racecar', output: 'YES', explanation: 'racecar reads identically backwards.' },
    { input: 'contest', output: 'NO', explanation: 'contest reversed is tsetnoc, not contest.' }
  ),
  // Q5
  makeDescription(
    'Given an array of N integers, reverse the array in-place and print the elements separated by a space.',
    ['1 <= N <= 100', '-1000 <= arr[i] <= 1000'],
    ['First line contains integer N.', 'Second line contains N space-separated integers.'],
    'Print the reversed array elements separated by spaces.',
    { input: '5\n1 2 3 4 5', output: '5 4 3 2 1', explanation: 'The array elements are printed in reverse order.' },
    { input: '4\n10 20 30 40', output: '40 30 20 10' }
  ),
  // Q6
  makeDescription(
    'Given an array of N distinct integers, find and print the second largest element.',
    ['2 <= N <= 100', 'All elements in the array are distinct.', '-10000 <= arr[i] <= 10000'],
    ['First line contains integer N.', 'Second line contains N space-separated integers.'],
    'Print the second largest integer.',
    { input: '5\n12 35 1 10 34', output: '34', explanation: 'The largest element is 35, and the second largest is 34.' },
    { input: '4\n-10 -5 -20 -2', output: '-5', explanation: 'The largest is -2, and the second largest is -5.' }
  ),
  // Q7
  makeDescription(
    'Compute and print the N-th Fibonacci number where sequence starts at F(0) = 0 and F(1) = 1 (i.e. F(n) = F(n-1) + F(n-2)).',
    ['0 <= N <= 30'],
    ['A single line containing integer N.'],
    'Print the N-th Fibonacci number.',
    { input: '0', output: '0', explanation: 'F(0) is defined as 0.' },
    { input: '7', output: '13', explanation: 'Sequence: 0, 1, 1, 2, 3, 5, 8, 13.' }
  ),
  // Q8
  makeDescription(
    'Given an array of N integers and a target integer K, count how many times K appears in the array.',
    ['1 <= N <= 100', '-1000 <= arr[i], K <= 1000'],
    ['First line contains integer N.', 'Second line contains N space-separated integers.', 'Third line contains target integer K.'],
    'Print the count of occurrences of K.',
    { input: '6\n1 2 2 3 2 4\n2', output: '3', explanation: 'The number 2 appears 3 times in the array.' },
    { input: '4\n5 10 15 20\n7', output: '0', explanation: '7 does not appear in the array.' }
  ),
  // Q9
  makeDescription(
    'Given an N x N square matrix of integers, calculate and print the sum of the primary diagonal and the secondary diagonal. If N is odd, count the center element only once.',
    ['1 <= N <= 20', '-100 <= matrix[i][j] <= 100'],
    ['First line contains integer N.', 'Next N lines each contain N space-separated integers.'],
    'Print the total diagonal sum.',
    { input: '3\n1 2 3\n4 5 6\n7 8 9', output: '25', explanation: 'Primary: 1+5+9=15. Secondary: 3+5+7=15. Center 5 counted once: 15+15-5 = 25.' },
    { input: '2\n1 2\n3 4', output: '10', explanation: '1 + 4 + 2 + 3 = 10.' }
  ),
  // Q10
  makeDescription(
    'Given a sorted array of N integers in non-decreasing order, count and print the number of unique (distinct) elements.',
    ['1 <= N <= 100', 'Array is sorted in non-decreasing order: arr[0] <= arr[1] <= ... <= arr[N-1]', '-10000 <= arr[i] <= 10000'],
    ['First line contains integer N.', 'Second line contains N space-separated integers.'],
    'Print the count of unique elements.',
    { input: '6\n1 1 2 2 3 4', output: '4', explanation: 'The unique elements are 1, 2, 3, and 4.' },
    { input: '5\n7 7 7 7 7', output: '1', explanation: 'All elements are identical, so only 1 unique element.' }
  ),
];

const TEST_CASES = [
  // Q1
  [
    { input: '5\n1 2 3 4 5', expected_output: '15', is_hidden: false },
    { input: '4\n10 -5 20 -15', expected_output: '10', is_hidden: false },
    { input: '1\n42', expected_output: '42', is_hidden: true },
    { input: '3\n-10 -20 -30', expected_output: '-60', is_hidden: true },
  ],
  // Q2
  [
    { input: '5\n-8 -3 -12 -1 -5', expected_output: '-1', is_hidden: false },
    { input: '4\n7 22 9 14', expected_output: '22', is_hidden: false },
    { input: '1\n-99', expected_output: '-99', is_hidden: true },
    { input: '5\n10 10 10 10 10', expected_output: '10', is_hidden: true },
  ],
  // Q3
  [
    { input: '6\n1 2 3 4 5 6', expected_output: '3', is_hidden: false },
    { input: '5\n-2 -3 -4 0 7', expected_output: '3', is_hidden: false },
    { input: '3\n1 3 5', expected_output: '0', is_hidden: true },
    { input: '4\n2 4 6 8', expected_output: '4', is_hidden: true },
  ],
  // Q4
  [
    { input: 'racecar', expected_output: 'YES', is_hidden: false },
    { input: 'contest', expected_output: 'NO', is_hidden: false },
    { input: 'a', expected_output: 'YES', is_hidden: true },
    { input: 'abba', expected_output: 'YES', is_hidden: true },
  ],
  // Q5
  [
    { input: '5\n1 2 3 4 5', expected_output: '5 4 3 2 1', is_hidden: false },
    { input: '4\n10 20 30 40', expected_output: '40 30 20 10', is_hidden: false },
    { input: '1\n99', expected_output: '99', is_hidden: true },
    { input: '3\n-5 0 5', expected_output: '5 0 -5', is_hidden: true },
  ],
  // Q6
  [
    { input: '5\n12 35 1 10 34', expected_output: '34', is_hidden: false },
    { input: '4\n-10 -5 -20 -2', expected_output: '-5', is_hidden: false },
    { input: '2\n100 50', expected_output: '50', is_hidden: true },
    { input: '3\n-1 -2 -3', expected_output: '-2', is_hidden: true },
  ],
  // Q7
  [
    { input: '0', expected_output: '0', is_hidden: false },
    { input: '7', expected_output: '13', is_hidden: false },
    { input: '1', expected_output: '1', is_hidden: true },
    { input: '10', expected_output: '55', is_hidden: true },
  ],
  // Q8
  [
    { input: '6\n1 2 2 3 2 4\n2', expected_output: '3', is_hidden: false },
    { input: '4\n5 10 15 20\n7', expected_output: '0', is_hidden: false },
    { input: '3\n4 4 4\n4', expected_output: '3', is_hidden: true },
    { input: '5\n-1 -1 0 1 -1\n-1', expected_output: '3', is_hidden: true },
  ],
  // Q9
  [
    { input: '3\n1 2 3\n4 5 6\n7 8 9', expected_output: '25', is_hidden: false },
    { input: '2\n1 2\n3 4', expected_output: '10', is_hidden: false },
    { input: '1\n5', expected_output: '5', is_hidden: true },
    { input: '3\n0 0 0\n0 0 0\n0 0 0', expected_output: '0', is_hidden: true },
  ],
  // Q10
  [
    { input: '6\n1 1 2 2 3 4', expected_output: '4', is_hidden: false },
    { input: '5\n7 7 7 7 7', expected_output: '1', is_hidden: false },
    { input: '1\n10', expected_output: '1', is_hidden: true },
    { input: '4\n1 2 3 4', expected_output: '4', is_hidden: true },
  ],
];

// ============================================================
// C Starter Codes (NO COMMENTS, 2-3 BUGS EACH)
// ============================================================
const C_STARTER_CODES = [
  // Q1: sumArray
  `#include <stdio.h>

int sumArray(int arr[], int n) {
    int sum = 1;
    for (int i = 1; i <= n; i++) {
        sum += arr[i];
    }
    return sum;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int arr[105];
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
    }
    printf("%d\\n", sumArray(arr, n));
    return 0;
}`,

  // Q2: findMax
  `#include <stdio.h>

int findMax(int arr[], int n) {
    int max = 0;
    for (int i = 0; i < n - 1; i++) {
        if (arr[i] < max) {
            max = arr[i];
        }
    }
    return max;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int arr[105];
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
    }
    printf("%d\\n", findMax(arr, n));
    return 0;
}`,

  // Q3: countEven
  `#include <stdio.h>

int countEven(int arr[], int n) {
    int count = 1;
    for (int i = 0; i <= n; i++) {
        if (arr[i] % 2 == 1) {
            count++;
        }
    }
    return count;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int arr[105];
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
    }
    printf("%d\\n", countEven(arr, n));
    return 0;
}`,

  // Q4: isPalindrome
  `#include <stdio.h>
#include <string.h>

int isPalindrome(char s[]) {
    int left = 0;
    int right = strlen(s);
    while (left > right) {
        if (s[left] != s[right]) {
            return 1;
        }
        left++;
        right--;
    }
    return 0;
}

int main() {
    char s[105];
    if (scanf("%s", s) != 1) return 0;
    if (isPalindrome(s)) {
        printf("YES\\n");
    } else {
        printf("NO\\n");
    }
    return 0;
}`,

  // Q5: reverseArray
  `#include <stdio.h>

void reverseArray(int arr[], int n) {
    int left = 0;
    int right = n;
    while (left < right) {
        arr[left] = arr[right];
        arr[right] = arr[left];
        left--;
        right++;
    }
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int arr[105];
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
    }
    reverseArray(arr, n);
    for (int i = 0; i < n; i++) {
        printf("%d%s", arr[i], (i == n - 1) ? "" : " ");
    }
    printf("\\n");
    return 0;
}`,

  // Q6: findSecondLargest
  `#include <stdio.h>

int findSecondLargest(int arr[], int n) {
    int first = 0;
    int second = 0;
    for (int i = 0; i < n; i++) {
        if (arr[i] > first) {
            second = first;
            first = arr[i];
        } else if (arr[i] < second) {
            second = arr[i];
        }
    }
    return first;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int arr[105];
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
    }
    printf("%d\\n", findSecondLargest(arr, n));
    return 0;
}`,

  // Q7: fibonacci
  `#include <stdio.h>

int fibonacci(int n) {
    if (n == 0) return 1;
    if (n == 1) return 1;
    int a = 0, b = 1, c = 0;
    for (int i = 2; i < n; i++) {
        a = b;
        b = c;
        c = a + b;
    }
    return c;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    printf("%d\\n", fibonacci(n));
    return 0;
}`,

  // Q8: countOccurrences
  `#include <stdio.h>

int countOccurrences(int arr[], int n, int key) {
    int count = -1;
    for (int i = 0; i < n; i += 2) {
        if (arr[i] != key) {
            count++;
        }
    }
    return count;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int arr[105];
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
    }
    int key;
    scanf("%d", &key);
    printf("%d\\n", countOccurrences(arr, n, key));
    return 0;
}`,

  // Q9: diagonalSum
  `#include <stdio.h>

int diagonalSum(int matrix[25][25], int n) {
    int sum = 0;
    for (int i = 0; i <= n; i++) {
        sum += matrix[i][i];
        sum += matrix[i][n - i];
    }
    return sum;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int matrix[25][25];
    for (int i = 0; i < n; i++) {
        for (int j = 0; j < n; j++) {
            scanf("%d", &matrix[i][j]);
        }
    }
    printf("%d\\n", diagonalSum(matrix, n));
    return 0;
}`,

  // Q10: countUnique
  `#include <stdio.h>

int countUnique(int arr[], int n) {
    if (n <= 0) return 0;
    int count = 0;
    for (int i = 0; i < n; i++) {
        if (arr[i] != arr[i + 1]) {
            count += 2;
        }
    }
    return count;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int arr[105];
    for (int i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
    }
    printf("%d\\n", countUnique(arr, n));
    return 0;
}`
];

// ============================================================
// Java Starter Codes (NO COMMENTS, 2-3 BUGS EACH)
// ============================================================
const JAVA_STARTER_CODES = [
  // Q1: sumArray
  `import java.util.Scanner;

public class Main {
    static int sumArray(int[] arr) {
        int sum = 1;
        for (int i = 1; i <= arr.length; i++) {
            sum += arr[i];
        }
        return sum;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) {
            arr[i] = sc.nextInt();
        }
        System.out.println(sumArray(arr));
    }
}`,

  // Q2: findMax
  `import java.util.Scanner;

public class Main {
    static int findMax(int[] arr) {
        int max = 0;
        for (int i = 0; i < arr.length - 1; i++) {
            if (arr[i] < max) {
                max = arr[i];
            }
        }
        return max;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) {
            arr[i] = sc.nextInt();
        }
        System.out.println(findMax(arr));
    }
}`,

  // Q3: countEven
  `import java.util.Scanner;

public class Main {
    static int countEven(int[] arr) {
        int count = 1;
        for (int i = 0; i <= arr.length; i++) {
            if (arr[i] % 2 == 1) {
                count++;
            }
        }
        return count;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) {
            arr[i] = sc.nextInt();
        }
        System.out.println(countEven(arr));
    }
}`,

  // Q4: isPalindrome
  `import java.util.Scanner;

public class Main {
    static boolean isPalindrome(String s) {
        int left = 0;
        int right = s.length();
        while (left > right) {
            if (s.charAt(left) != s.charAt(right)) {
                return true;
            }
            left++;
            right--;
        }
        return false;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.next();
        if (isPalindrome(s)) {
            System.out.println("YES");
        } else {
            System.out.println("NO");
        }
    }
}`,

  // Q5: reverseArray
  `import java.util.Scanner;

public class Main {
    static void reverseArray(int[] arr) {
        int left = 0;
        int right = arr.length;
        while (left < right) {
            arr[left] = arr[right];
            arr[right] = arr[left];
            left--;
            right++;
        }
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) {
            arr[i] = sc.nextInt();
        }
        reverseArray(arr);
        for (int i = 0; i < n; i++) {
            System.out.print(arr[i] + (i == n - 1 ? "" : " "));
        }
        System.out.println();
    }
}`,

  // Q6: findSecondLargest
  `import java.util.Scanner;

public class Main {
    static int findSecondLargest(int[] arr) {
        int first = 0;
        int second = 0;
        for (int i = 0; i < arr.length; i++) {
            if (arr[i] > first) {
                second = first;
                first = arr[i];
            } else if (arr[i] < second) {
                second = arr[i];
            }
        }
        return first;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) {
            arr[i] = sc.nextInt();
        }
        System.out.println(findSecondLargest(arr));
    }
}`,

  // Q7: fibonacci
  `import java.util.Scanner;

public class Main {
    static int fibonacci(int n) {
        if (n == 0) return 1;
        if (n == 1) return 1;
        int a = 0, b = 1, c = 0;
        for (int i = 2; i < n; i++) {
            a = b;
            b = c;
            c = a + b;
        }
        return c;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        System.out.println(fibonacci(n));
    }
}`,

  // Q8: countOccurrences
  `import java.util.Scanner;

public class Main {
    static int countOccurrences(int[] arr, int key) {
        int count = -1;
        for (int i = 0; i < arr.length; i += 2) {
            if (arr[i] != key) {
                count++;
            }
        }
        return count;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) {
            arr[i] = sc.nextInt();
        }
        int key = sc.nextInt();
        System.out.println(countOccurrences(arr, key));
    }
}`,

  // Q9: diagonalSum
  `import java.util.Scanner;

public class Main {
    static int diagonalSum(int[][] matrix, int n) {
        int sum = 0;
        for (int i = 0; i <= n; i++) {
            sum += matrix[i][i];
            sum += matrix[i][n - i];
        }
        return sum;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[][] matrix = new int[n][n];
        for (int i = 0; i < n; i++) {
            for (int j = 0; j < n; j++) {
                matrix[i][j] = sc.nextInt();
            }
        }
        System.out.println(diagonalSum(matrix, n));
    }
}`,

  // Q10: countUnique
  `import java.util.Scanner;

public class Main {
    static int countUnique(int[] arr) {
        if (arr.length == 0) return 0;
        int count = 0;
        for (int i = 0; i < arr.length; i++) {
            if (arr[i] != arr[i + 1]) {
                count += 2;
            }
        }
        return count;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int[] arr = new int[n];
        for (int i = 0; i < n; i++) {
            arr[i] = sc.nextInt();
        }
        System.out.println(countUnique(arr));
    }
}`
];

// ============================================================
// Python Starter Codes (NO COMMENTS, 2-3 BUGS EACH)
// ============================================================
const PYTHON_STARTER_CODES = [
  // Q1: sum_array
  `def sum_array(arr):
    total = 1
    for i in range(1, len(arr)):
        total -= arr[i]
    return total

n = int(input())
arr = list(map(int, input().split()))
print(sum_array(arr))`,

  // Q2: find_max
  `def find_max(arr):
    max_val = 0
    for num in arr[:-1]:
        if num < max_val:
            max_val = num
    return max_val

n = int(input())
arr = list(map(int, input().split()))
print(find_max(arr))`,

  // Q3: count_even
  `def count_even(arr):
    count = 1
    for num in arr:
        if num % 2 != 0:
            count += 1
    return len(arr) - count

n = int(input())
arr = list(map(int, input().split()))
print(count_even(arr))`,

  // Q4: is_palindrome
  `def is_palindrome(s):
    left = 0
    right = len(s)
    while left > right:
        if s[left] != s[right]:
            return True
        left += 1
        right -= 1
    return False

s = input().strip()
if is_palindrome(s):
    print("YES")
else:
    print("NO")`,

  // Q5: reverse_array
  `def reverse_array(arr):
    left = 0
    right = len(arr)
    while left < right:
        arr[left] = arr[right]
        arr[right] = arr[left]
        left -= 1
        right += 1

n = int(input())
arr = list(map(int, input().split()))
reverse_array(arr)
print(" ".join(map(str, arr)))`,

  // Q6: find_second_largest
  `def find_second_largest(arr):
    first = 0
    second = 0
    for num in arr:
        if num > first:
            second = first
            first = num
        elif num < second:
            second = num
    return first

n = int(input())
arr = list(map(int, input().split()))
print(find_second_largest(arr))`,

  // Q7: fibonacci
  `def fibonacci(n):
    if n == 0:
        return 1
    if n == 1:
        return 1
    a, b = 0, 1
    for _ in range(2, n):
        a = b
        b = a + b
    return b

n = int(input())
print(fibonacci(n))`,

  // Q8: count_occurrences
  `def count_occurrences(arr, key):
    count = -1
    for i in range(0, len(arr), 2):
        if arr[i] != key:
            count += 1
    return count

n = int(input())
arr = list(map(int, input().split()))
key = int(input())
print(count_occurrences(arr, key))`,

  // Q9: diagonal_sum
  `def diagonal_sum(matrix, n):
    total = 0
    for i in range(n + 1):
        total += matrix[i][i]
        total += matrix[i][n - i]
    return total

n = int(input())
matrix = []
for _ in range(n):
    matrix.append(list(map(int, input().split())))
print(diagonal_sum(matrix, n))`,

  // Q10: count_unique
  `def count_unique(arr):
    if not arr:
        return 0
    count = 0
    for i in range(len(arr)):
        if arr[i] != arr[i + 1]:
            count += 2
    return count

n = int(input())
arr = list(map(int, input().split()))
print(count_unique(arr))`
];

const TITLES = [
  'Sum of Array Elements',
  'Find Maximum Element',
  'Count Even Numbers',
  'Check Palindrome String',
  'Reverse an Array',
  'Second Largest Element',
  'N-th Fibonacci Number',
  'Count Occurrences of Key',
  'Matrix Diagonal Sum',
  'Count Unique in Sorted Array'
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding 10 questions per language (30 total questions)...');
    await client.query('BEGIN');

    // ---- Admin User ----
    const adminHash = await bcrypt.hash('Admin@HiTech2024', 12);
    await client.query(`
      INSERT INTO admins (username, password_hash)
      VALUES ($1, $2)
      ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
    `, ['admin', adminHash]);
    console.log('  [OK] Admin user');

    // ---- Contestants ----
    const contestants = [
      { reg: '720824108119', name: 'Demo Student 1', dept: 'Artificial Intelligence and Data Science' },
      { reg: '720824108120', name: 'Demo Student 2', dept: 'Artificial Intelligence and Data Science' },
      { reg: '720824108121', name: 'Demo Student 3', dept: 'Artificial Intelligence and Data Science' },
    ];

    for (const c of contestants) {
      const hash = await bcrypt.hash(`${c.reg}@hitech`, 12);
      await client.query(`
        INSERT INTO contestants (registration_number, name, department, password_hash)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (registration_number) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
      `, [c.reg, c.name, c.dept, hash]);
    }
    console.log('  [OK] 3 demo contestants (passwords: <regno>@hitech)');

    // ---- Contest ----
    const contestResult = await client.query(`
      INSERT INTO contests (title, description, duration_minutes, max_violations, is_active, show_score_to_contestant)
      VALUES ($1, $2, $3, $4, $5, false)
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      'Debugging Contest',
      'Department of Artificial Intelligence and Data Science — Hindusthan Institute of Technology',
      60,
      3,
      true,
    ]);
    await client.query('UPDATE contests SET show_score_to_contestant = false');

    let contestId: string;
    if (contestResult.rows.length === 0) {
      const existing = await client.query('SELECT id FROM contests WHERE title = $1', ['Debugging Contest']);
      contestId = existing.rows[0].id;
    } else {
      contestId = contestResult.rows[0].id;
    }
    console.log(`  [OK] Contest id=${contestId}`);

    // Clear old test attempts and answers to provide a clean state for the 10 questions
    await client.query('DELETE FROM violations');
    await client.query('DELETE FROM contest_events');
    await client.query('DELETE FROM evaluation_runs');
    await client.query('DELETE FROM answers');
    await client.query('DELETE FROM attempts');
    console.log('  [OK] Cleaned previous test attempts and answers');

    // Insert questions for each language
    const languages = [
      { lang: 'C', codes: C_STARTER_CODES },
      { lang: 'JAVA', codes: JAVA_STARTER_CODES },
      { lang: 'PYTHON', codes: PYTHON_STARTER_CODES },
    ];

    for (const { lang, codes } of languages) {
      for (let idx = 0; idx < 10; idx++) {
        const qNum = idx + 1;
        const title = TITLES[idx];
        const description = DESCRIPTIONS[idx];
        const starterCode = codes[idx];
        const testCases = TEST_CASES[idx];

        // Upsert question
        const qResult = await client.query(`
          INSERT INTO questions (contest_id, question_number, language, title, description, starter_code, difficulty, points)
          VALUES ($1, $2, $3, $4, $5, $6, 'MEDIUM', 10)
          ON CONFLICT (contest_id, question_number, language) DO UPDATE
          SET title = EXCLUDED.title, description = EXCLUDED.description,
              starter_code = EXCLUDED.starter_code, points = EXCLUDED.points
          RETURNING id
        `, [contestId, qNum, lang, title, description, starterCode]);

        const questionId = qResult.rows[0].id;

        // Delete existing test cases and re-insert
        await client.query('DELETE FROM test_cases WHERE question_id = $1', [questionId]);
        for (const tc of testCases) {
          await client.query(`
            INSERT INTO test_cases (question_id, input_data, expected_output, is_hidden)
            VALUES ($1, $2, $3, $4)
          `, [questionId, tc.input, tc.expected_output, tc.is_hidden]);
        }
      }
      console.log(`  [OK] ${lang} questions (10 questions, ${TEST_CASES.reduce((s, tc) => s + tc.length, 0)} test cases)`);
    }

    await client.query('COMMIT');
    console.log('Seed complete with 10 questions per language, no comment hints, and full Markdown formatting.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
