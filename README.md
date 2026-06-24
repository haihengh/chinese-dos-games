这个是原repo的分支，增加网页功能，具体在web文件夹下面有详尽的readme文件。因为储存问题，这个repo需要先下载游戏才能运行，具体下载参考下面的命令。所有游戏下载完大概35g的容量。


下面是原repo的readme





# 🎮 中文 DOS 游戏

网址： https://dos.lol

中文 DOS 游戏合集，目前共有 1898 款游戏。

## 新增功能 · Recent Updates

✨ **AI 游戏助手 — Wawa 🐱** (2025-06-23)
- 🎯 **游戏感知**: AI 自动获知当前游戏名称、类型、操作按键和秘籍
- 🖼️ **截屏修复**: js-dos 原生 API + JPEG 85% 质量；不支持视觉的模型自动回退文字模式
- 🎤 **语音输入**: `--ssl` + 持久化 SSL 证书，麦克风支持任意地址
- 🔊 **Edge TTS**: 免费微软神经网络语音，普通话/广东话、男/女声可选，语速可调
- ⌨️ **不暂停打字**: 游戏持续运行，聊天不中断游戏
- 📌 **面板固定**: 固定面板 + 页面自动右移，游戏画面不遮挡
- 👤 **个人中心增强**: 存档统计、上传记录、游戏存档列表
- 🔗 **DeepSeek 兼容**: 支持 DeepSeek API，自动处理视觉/非视觉模型差异

✨ **Save/Restore 功能修复** (2025-06-23)
- 游戏存档现在能正确保存并在页面刷新后恢复
- 使用浏览器 IndexedDB 本地存储，无需云端同步
- 无需登录即可保存游戏进度

详见 [CHANGELOG.md](CHANGELOG.md) 和 [web/README.md](web/README.md)

## 下载游戏文件

在根目录下运行 Python 3 脚本

``` python
python download_data.py
```

若下载出错请参见 [Issue #26](https://github.com/rwv/chinese-dos-games/issues/26)

## 游戏列表

参见 https://dos.lol/games

## IPFS

IPNS Hash: [`k2k4r8oyknzob8jjqpj6toer4dw3jc6srsbqlbsalktnw1fopb7iyqd2`](https://ipfs.io/ipns/k2k4r8oyknzob8jjqpj6toer4dw3jc6srsbqlbsalktnw1fopb7iyqd2)

## 网站源代码

请参见 [rwv/chinese-dos-games-web: 🌐 Source code of https://dos.zczc.cz](https://github.com/rwv/chinese-dos-games-web)

## 版权问题

本人明白此项目存在版权上的侵权，如版权方介意的话，请联系 [chinese.dos.games@outlook.com](mailto:chinese.dos.games@outlook.com)，本人将立刻删除有关文件。

## Contributing

欢迎提 [Issue](https://github.com/rwv/chinese-dos-games/issues) 和 [Pull request](https://github.com/rwv/chinese-dos-games/pulls) 来增加新的游戏!

PR 具体参见 [CONTRIBUTING.md](https://github.com/rwv/chinese-dos-games/blob/master/CONTRIBUTING.md)

## Credits

* [dreamlayers/em-dosbox: An Emscripten port of DOSBox](https://github.com/dreamlayers/em-dosbox)
* [db48x/emularity: easily embed emulators](https://github.com/db48x/emularity)
* [衡兰若芷制作的DOS游戏合集](https://tieba.baidu.com/p/3962261741)
