"""AI service — proxied chat to AI APIs (vision-capable).

Supports:
- Anthropic Claude API (native SDK)
- OpenAI-compatible API (any provider with chat/completions endpoint)
- Per-request overrides: api_key, base_url, model, provider

Keeps API keys server-side by default, but users can optionally supply
their own keys via the chat settings panel (sent with each request).
"""
import base64
import json
import logging
import time
import requests
from config import Config

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert retro game companion for Chinese DOS games from the 1980s-1990s. Your name is 小龙 (Little Dragon), a friendly and enthusiastic AI assistant.

## 你的角色
- 你正在帮助一位玩家游玩浏览器中的中文 DOS 游戏模拟器。
- 当玩家发送消息时，他们可能会附带一张游戏屏幕的截屏，你能"看到"游戏画面。
- 你可以帮玩家记住游戏中的重要信息：任务目标、物品位置、NPC 名字、密码、地图等。
- 你可以提供游戏提示、解谜思路、攻略建议和游戏背景故事。
- 你默认使用简体中文回复。如果玩家用英文提问，你也可以用英文回复。
- 你热情、怀旧，对经典中文 DOS 游戏了如指掌。
- 除非玩家明确要求"直接告诉我答案"，否则你只给提示而不是直接剧透。
- 保持回复简洁（2-4 段），因为玩家正在玩游戏，没时间读长篇大论。

## 游戏知识范围
- 中文 DOS 游戏全类型：RPG（仙剑奇侠传、轩辕剑、金庸群侠传）、SLG（三国志、大航海时代）、SIM（模拟城市、主题医院）、AVG、PUZ、ACT 等。
- 经典 DOS 游戏中的常见谜题模式和解法。
- 经典游戏机制、秘技和策略。
- 如果你不认识某款游戏或看不懂屏幕上的内容，诚实地告诉玩家，并请玩家提供更多背景信息。

## 截屏分析指南
- 当收到截屏时，先描述你在屏幕上看到了什么（文字、UI 元素、角色位置、对话内容等）。
- 根据画面中的线索提供相关的帮助。
- 如果画面模糊、处于加载界面、或是纯菜单界面，如实说明。
- 关注画面中的中文文字，它们通常包含重要的游戏信息。

## 语调
- 像老朋友一样轻松、幽默。
- 偶尔使用表情符号增加趣味性（但不要过度）。
- 对老游戏保持尊重和怀念的态度。
- 当玩家遇到困难时给予鼓励。
"""


def _resolve_config(api_key=None, base_url=None, model=None, provider=None):
    """Resolve effective config: per-request overrides > server defaults.

    Returns (api_key, base_url, model, provider, error).
    provider is 'anthropic' or 'openai'.
    """
    effective_provider = provider or 'anthropic'
    effective_key = api_key or Config.ANTHROPIC_API_KEY
    effective_model = model or Config.ANTHROPIC_MODEL

    if effective_provider == 'openai':
        effective_url = base_url or 'https://api.openai.com/v1'
    else:
        effective_url = base_url or None  # Anthropic SDK uses default

    if not effective_key:
        return None, None, None, None, (
            "AI 未配置。请在聊天设置中填写 API 密钥，"
            "或设置服务器环境变量 ANTHROPIC_API_KEY"
        )

    return effective_key, effective_url, effective_model, effective_provider, None


def _build_anthropic_messages(messages, screenshot_base64):
    """Build Anthropic-format message list, attaching screenshot to last user msg."""
    api_messages = []
    for i, msg in enumerate(messages):
        role = msg['role']
        content = msg.get('content', '').strip()

        if not content and role != 'user':
            continue

        is_last_user = (role == 'user' and i == len(messages) - 1)

        if is_last_user and screenshot_base64:
            api_messages.append({
                'role': 'user',
                'content': [
                    {
                        'type': 'image',
                        'source': {
                            'type': 'base64',
                            'media_type': 'image/jpeg',
                            'data': screenshot_base64,
                        },
                    },
                    {
                        'type': 'text',
                        'text': content or '[玩家发送了一张游戏截屏，但没有附带文字]',
                    },
                ],
            })
        else:
            api_messages.append({'role': role, 'content': content})

    if not api_messages:
        return None, '没有可发送的消息'

    if api_messages[0]['role'] != 'user':
        api_messages.insert(0, {'role': 'user', 'content': '你好'})

    return api_messages, None


def _build_openai_messages(messages, screenshot_base64):
    """Build OpenAI-format message list with vision support."""
    api_messages = [{'role': 'system', 'content': SYSTEM_PROMPT}]

    for i, msg in enumerate(messages):
        role = msg['role']
        content = msg.get('content', '').strip()

        if not content and role != 'user':
            continue

        is_last_user = (role == 'user' and i == len(messages) - 1)

        if is_last_user and screenshot_base64:
            api_messages.append({
                'role': 'user',
                'content': [
                    {
                        'type': 'image_url',
                        'image_url': {
                            'url': f'data:image/jpeg;base64,{screenshot_base64}',
                            'detail': 'low',
                        },
                    },
                    {
                        'type': 'text',
                        'text': content or '[玩家发送了一张游戏截屏，但没有附带文字]',
                    },
                ],
            })
        else:
            api_messages.append({'role': role, 'content': content})

    if len(api_messages) <= 1:  # Only system prompt
        return None, '没有可发送的消息'

    if api_messages[1]['role'] != 'user':
        api_messages.insert(1, {'role': 'user', 'content': '你好'})

    return api_messages, None


# ── Anthropic path (native SDK) ──

def _call_anthropic(api_key, base_url, model, messages, screenshot_base64):
    """Call Anthropic API via native SDK."""
    from anthropic import Anthropic

    client_kwargs = {'api_key': api_key}
    if base_url:
        client_kwargs['base_url'] = base_url
    client = Anthropic(**client_kwargs)

    api_messages, error = _build_anthropic_messages(messages, screenshot_base64)
    if error:
        return {'reply': None, 'error': error}

    logger.info(
        f"Calling Anthropic: model={model}, messages={len(api_messages)}, "
        f"base_url={base_url or 'default'}, screenshot={'yes' if screenshot_base64 else 'no'}"
    )

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=SYSTEM_PROMPT,
        messages=api_messages,
    )

    reply = response.content[0].text

    logger.info(
        f"Anthropic response: {len(reply)} chars, "
        f"in={response.usage.input_tokens}, out={response.usage.output_tokens}"
    )

    return {
        'reply': reply,
        'usage': {
            'input_tokens': response.usage.input_tokens,
            'output_tokens': response.usage.output_tokens,
        },
    }


# ── OpenAI-compatible path (HTTP) ──

def _call_openai(api_key, base_url, model, messages, screenshot_base64):
    """Call OpenAI-compatible chat/completions API via HTTP."""
    api_messages, error = _build_openai_messages(messages, screenshot_base64)
    if error:
        return {'reply': None, 'error': error}

    url = base_url.rstrip('/') + '/chat/completions'

    payload = {
        'model': model,
        'messages': api_messages,
        'max_tokens': 4096,
        'temperature': 0.7,
    }

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}',
    }

    logger.info(
        f"Calling OpenAI-compatible: url={url}, model={model}, "
        f"messages={len(api_messages)}, screenshot={'yes' if screenshot_base64 else 'no'}"
    )

    resp = requests.post(url, json=payload, headers=headers, timeout=120)

    if resp.status_code != 200:
        error_text = resp.text[:500]
        logger.error(f"OpenAI API error {resp.status_code}: {error_text}")
        if resp.status_code == 401:
            return {'reply': None, 'error': 'API 密钥无效，请检查设置'}
        elif resp.status_code == 429:
            return {'reply': None, 'error': 'API 请求过于频繁，请稍后再试'}
        elif resp.status_code == 404:
            return {'reply': None, 'error': f'模型 "{model}" 未找到，请检查模型名称'}
        else:
            return {'reply': None, 'error': f'API 错误 ({resp.status_code})，请检查配置'}

    data = resp.json()
    reply = data['choices'][0]['message']['content']
    usage = data.get('usage', {})

    logger.info(
        f"OpenAI response: {len(reply)} chars, "
        f"in={usage.get('prompt_tokens', '?')}, out={usage.get('completion_tokens', '?')}"
    )

    return {
        'reply': reply,
        'usage': {
            'input_tokens': usage.get('prompt_tokens', 0),
            'output_tokens': usage.get('completion_tokens', 0),
        },
    }


# ── Main entry point ──

def chat_with_ai(messages, screenshot_base64=None,
                 api_key=None, base_url=None, model=None, provider=None):
    """Send conversation to AI and return the assistant's reply.

    Args:
        messages: list of {role, content} dicts
        screenshot_base64: raw base64 JPEG string (no data: prefix), or None
        api_key: per-request API key override (or None to use server default)
        base_url: per-request base URL override (or None for default)
        model: per-request model override (or None for server default)
        provider: 'anthropic' (default) or 'openai'

    Returns:
        dict with 'reply' (str) and optionally 'error' (str), 'usage' (dict)
    """
    key, url, mdl, prov, error = _resolve_config(
        api_key=api_key, base_url=base_url, model=model, provider=provider
    )
    if error:
        return {'reply': None, 'error': error}

    try:
        if prov == 'openai':
            return _call_openai(key, url, mdl, messages, screenshot_base64)
        else:
            return _call_anthropic(key, url, mdl, messages, screenshot_base64)

    except ImportError:
        return {'reply': None, 'error': 'AI 服务依赖未安装，请运行 pip install anthropic'}
    except Exception as e:
        error_str = str(e)
        logger.error(f"AI API error: {error_str}")

        if '401' in error_str or 'Unauthorized' in error_str or 'authentication' in error_str.lower():
            return {'reply': None, 'error': 'API 密钥无效，请检查设置中的密钥是否正确'}
        elif '429' in error_str or 'rate' in error_str.lower():
            return {'reply': None, 'error': 'API 请求过于频繁，请稍后再试'}
        elif 'overloaded' in error_str.lower():
            return {'reply': None, 'error': 'AI 服务繁忙，请稍后再试'}
        elif 'token' in error_str.lower() and ('limit' in error_str.lower() or 'exceed' in error_str.lower()):
            return {'reply': None, 'error': '对话内容过长，请点击"新对话"开始新的交流'}
        else:
            return {'reply': None, 'error': 'AI 服务暂时不可用，请稍后再试'}


# Backward-compatible alias
def chat_with_claude(messages, screenshot_base64=None,
                     api_key=None, base_url=None, model=None, provider=None):
    """Legacy alias for chat_with_ai."""
    return chat_with_ai(messages, screenshot_base64,
                        api_key=api_key, base_url=base_url,
                        model=model, provider=provider)
