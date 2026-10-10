"""
猜数字小游戏
玩法：电脑随机生成一个 1-100 的数字，玩家输入猜测，
     程序提示“大了”或“小了”，直到猜中为止，并统计猜了几次。
"""

import random  # 导入 random 模块，用来生成随机数


def main():
    # 1. 电脑随机想一个 1 到 100 之间的整数
    answer = random.randint(1, 100)

    count = 0  # 用来记录玩家猜了几次

    print("=" * 30)
    print("欢迎来到猜数字小游戏！")
    print("我已经想好了一个 1 到 100 之间的数字，快来猜猜吧！")
    print("=" * 30)

    # 2. 用 while 循环让玩家不断猜，直到猜中为止
    while True:
        # 读取玩家输入，并转成整数
        guess = input("请输入你猜的数字（1-100）：")

        # 防止玩家输入的不是数字，导致程序报错
        if not guess.isdigit():
            print("输入无效，请输入一个整数哦！")
            continue  # 跳过后面的代码，重新开始循环

        guess = int(guess)
        count += 1  # 每猜一次，次数加 1

        # 3. 比较玩家猜的数字和答案，给出提示
        if guess > answer:
            print("大了！再猜小一点。")
        elif guess < answer:
            print("小了！再猜大一点。")
        else:
            # 猜中了，结束循环
            print(f"恭喜你，猜对了！答案就是 {answer}。")
            print(f"你一共猜了 {count} 次。")
            break


# 当直接运行这个文件时，执行 main() 函数
if __name__ == "__main__":
    main()
