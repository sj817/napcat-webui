import { Button } from '@heroui/button';
import { CardBody, CardHeader } from '@heroui/card';
import { Code } from '@heroui/code';
import { Image } from '@heroui/image';
import { Input } from '@heroui/input';
import { Link } from '@heroui/link';
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  useDisclosure,
} from '@heroui/modal';
import { Select, SelectItem } from '@heroui/select';
import { useLocalStorage } from '@uidotdev/usehooks';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { IoClipboardOutline, IoKeyOutline, IoServerOutline } from 'react-icons/io5';
import { useNavigate } from 'react-router-dom';

import key from '@/const/key';

import HoverEffectCard from '@/components/effect_card';
import { title } from '@/components/primitives';
import { ThemeSwitch } from '@/components/theme-switch';

import logo from '@/assets/images/logo.png';
import WebUIManager from '@/controllers/webui_manager';
import PureLayout from '@/layouts/pure';

export default function WebLoginPage () {
  const urlSearchParams = new URLSearchParams(window.location.search);
  const token = urlSearchParams.get('token');
  const navigate = useNavigate();
  const [tokenValue, setTokenValue] = useState<string>(token || '');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPasskeyLoading, setIsPasskeyLoading] = useState<boolean>(true); // 初始为true，表示正在检查passkey
  const [, setLocalToken] = useLocalStorage<string>(key.token, '');
  const [baseProtocol, setBaseProtocol] = useLocalStorage<string>(key.baseProtocol, 'http');
  const [baseHost, setBaseHost] = useLocalStorage<string>(key.baseHost, 'localhost');
  const [basePort, setBasePort] = useLocalStorage<string>(key.basePort, '6099');
  const { isOpen: isHelpOpen, onOpen: onHelpOpen, onClose: onHelpClose } = useDisclosure();

  // 迁移旧数据：清理 baseHost 中的协议前缀
  useEffect(() => {
    if (baseHost.startsWith('http://') || baseHost.startsWith('https://')) {
      const cleanHost = baseHost.replace(/^https?:\/\//, '');
      setBaseHost(cleanHost || 'localhost');
    }
  }, []);

  // 快速填充输入框的值
  const [quickFillUrl, setQuickFillUrl] = useState<string>('');

  // 解析粘贴的完整 URL，自动填充协议、地址、端口和 token
  const handleQuickFillChange = (value: string) => {
    setQuickFillUrl(value);

    // 检查是否是完整的 URL 格式
    const urlPattern = /^(https?):\/\/([^/:]+)(?::(\d+))?(\/.*)?$/;
    const match = value.match(urlPattern);

    if (match) {
      const [, protocol, host, port, path] = match;

      // 设置协议
      setBaseProtocol(protocol);

      // 设置主机地址
      setBaseHost(host);

      // 设置端口（如果有）
      if (port) {
        setBasePort(port);
      }

      // 尝试从 URL 中提取 token 参数
      if (path) {
        try {
          const url = new URL(value);
          const tokenParam = url.searchParams.get('token');
          if (tokenParam) {
            setTokenValue(tokenParam);
          }
        } catch {
          // URL 解析失败，忽略
        }
      }

      // 解析成功后清空输入框并提示
      setQuickFillUrl('');
      toast.success('地址解析成功');
    }
  };

  // Helper function to decode base64url
  function base64UrlToUint8Array (base64Url: string): Uint8Array {
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Helper function to encode Uint8Array to base64url
  function uint8ArrayToBase64Url (uint8Array: Uint8Array): string {
    const base64 = btoa(String.fromCharCode(...uint8Array));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  }

  // 自动检查并尝试passkey登录
  const tryPasskeyLogin = async () => {
    try {
      // 检查是否有passkey
      const options = await WebUIManager.generatePasskeyAuthenticationOptions();

      // 如果有passkey，自动进行认证
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: base64UrlToUint8Array(options.challenge) as BufferSource,
          allowCredentials: options.allowCredentials?.map((cred: any) => ({
            id: base64UrlToUint8Array(cred.id) as BufferSource,
            type: cred.type,
            transports: cred.transports,
          })),
          userVerification: options.userVerification,
        },
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Passkey authentication cancelled');
      }

      // 准备响应进行验证 - 转换为base64url字符串格式
      const authResponse = credential.response as AuthenticatorAssertionResponse;
      const response = {
        id: credential.id,
        rawId: uint8ArrayToBase64Url(new Uint8Array(credential.rawId)),
        response: {
          authenticatorData: uint8ArrayToBase64Url(new Uint8Array(authResponse.authenticatorData)),
          clientDataJSON: uint8ArrayToBase64Url(new Uint8Array(authResponse.clientDataJSON)),
          signature: uint8ArrayToBase64Url(new Uint8Array(authResponse.signature)),
          userHandle: authResponse.userHandle ? uint8ArrayToBase64Url(new Uint8Array(authResponse.userHandle)) : null,
        },
        type: credential.type,
      };

      // 验证认证
      const data = await WebUIManager.verifyPasskeyAuthentication(response);

      if (data && data.Credential) {
        setLocalToken(data.Credential);
        navigate('/qq_login', { replace: true });
        return true; // 登录成功
      }
    } catch (error) {
      // passkey登录失败，继续显示token登录界面
      console.log('Passkey login failed or not available:', error);
    }
    return false; // 登录失败
  };

  const onSubmit = async () => {
    if (!baseHost || !baseHost.trim()) {
      toast.error('请输入后端地址');

      return;
    }
    if (!basePort || !basePort.trim()) {
      toast.error('请输入端口号');

      return;
    }
    if (!tokenValue) {
      toast.error('请输入token');

      return;
    }

    // Check for Mixed Content risk
    const isMixedContentRisk = window.location.protocol === 'https:' && baseProtocol === 'http';

    setIsLoading(true);
    try {
      const data = await WebUIManager.loginWithToken(tokenValue);

      if (data) {
        setLocalToken(data);
        navigate('/qq_login', { replace: true });
      }
    } catch (error) {
      const err = error as Error;
      // If we suspected a mixed content risk and got a network error, it's very likely the cause.
      if (isMixedContentRisk && (err.message === 'Network Error' || err.message.includes('Network Error'))) {
        toast.error('连接失败：检测到混合内容错误(Mixed Content)，请查看下方"遇到网络错误？"帮助', {
          duration: 5000,
        });
        onHelpOpen();
      } else {
        toast.error(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 如果URL中有token，直接登录
    if (token) {
      onSubmit();
      return;
    }

    // 否则尝试passkey自动登录
    tryPasskeyLogin().finally(() => {
      setIsPasskeyLoading(false);
    });
  }, []);

  return (
    <>
      <title>WebUI登录 - NapCat WebUI</title>
      <PureLayout>
        <div className='w-[608px] max-w-full py-8 px-2 md:px-8 overflow-hidden'>
          <HoverEffectCard
            className='items-center gap-4 pt-0 pb-6 bg-default-50'
            maxXRotation={3}
            maxYRotation={3}
          >
            <CardHeader className='inline-block max-w-lg text-center justify-center'>
              <div className='flex items-center justify-center w-full gap-2 pt-10'>
                <Image alt='logo' height='7em' src={logo} />
                <div>
                  <span className={title()}>Web&nbsp;</span>
                  <span className={title({ color: 'violet' })}>
                    Login&nbsp;
                  </span>
                </div>
              </div>
              <ThemeSwitch className='absolute right-4 top-4' />
            </CardHeader>

            <CardBody className='flex gap-5 py-5 px-5 md:px-10'>
              {isPasskeyLoading && (
                <div className='text-center text-small text-default-600 dark:text-default-400 px-2'>
                  🔐 正在检查Passkey...
                </div>
              )}
              <form
                className='flex flex-col w-full'
                onSubmit={(e) => {
                  e.preventDefault();
                  onSubmit();
                }}
              >
                {/* 快速填充输入框 */}
                <Input
                  type='text'
                  classNames={{
                    label: 'text-black/50 dark:text-white/90',
                    input: [
                      'bg-transparent',
                      'text-black/90 dark:text-white/90',
                      'placeholder:text-default-700/50 dark:placeholder:text-white/60',
                    ],
                    innerWrapper: 'bg-transparent',
                    inputWrapper: [
                      'shadow-xl',
                      'bg-default-100/70',
                      'dark:bg-default/60',
                      'backdrop-blur-xl',
                      'backdrop-saturate-200',
                      'hover:bg-default-0/70',
                      'dark:hover:bg-default/70',
                      'group-data-[focus=true]:bg-default-100/50',
                      'dark:group-data-[focus=true]:bg-default/60',
                      '!cursor-text',
                    ],
                  }}
                  isDisabled={isLoading || isPasskeyLoading}
                  label='快速填充'
                  placeholder='粘贴完整URL自动解析，如 http://127.0.0.1:6099/webui?token=xxx'
                  radius='lg'
                  size='lg'
                  startContent={
                    <IoClipboardOutline className='text-black/50 mb-0.5 dark:text-white/90 text-slate-400 pointer-events-none flex-shrink-0' />
                  }
                  value={quickFillUrl}
                  onChange={(e) => handleQuickFillChange(e.target.value)}
                  description='支持粘贴终端中复制的完整地址，自动解析协议、地址、端口和Token'
                />

                <div className='h-4' />

                {/* 后端地址输入框 - 水平排列 */}
                <div className='flex gap-2 items-start'>
                  <Select
                    isRequired
                    label='协议'
                    className='w-28'
                    classNames={{
                      trigger: [
                        'shadow-xl',
                        'bg-default-100/70',
                        'dark:bg-default/60',
                        'backdrop-blur-xl',
                        'backdrop-saturate-200',
                      ],
                      popoverContent: 'bg-opacity-80 backdrop-blur',
                    }}
                    isDisabled={isLoading || isPasskeyLoading}
                    radius='lg'
                    size='lg'
                    selectedKeys={[baseProtocol]}
                    onChange={(e) => setBaseProtocol(e.target.value)}
                  >
                    <SelectItem key='http'>http</SelectItem>
                    <SelectItem key='https'>https</SelectItem>
                  </Select>
                  <Input
                    isRequired
                    type='text'
                    name='baseHost'
                    className='flex-1'
                    classNames={{
                      label: 'text-black/50 dark:text-white/90',
                      input: [
                        'bg-transparent',
                        'text-black/90 dark:text-white/90',
                        'placeholder:text-default-700/50 dark:placeholder:text-white/60',
                      ],
                      innerWrapper: 'bg-transparent',
                      inputWrapper: [
                        'shadow-xl',
                        'bg-default-100/70',
                        'dark:bg-default/60',
                        'backdrop-blur-xl',
                        'backdrop-saturate-200',
                        'hover:bg-default-0/70',
                        'dark:hover:bg-default/70',
                        'group-data-[focus=true]:bg-default-100/50',
                        'dark:group-data-[focus=true]:bg-default/60',
                        '!cursor-text',
                      ],
                    }}
                    isDisabled={isLoading || isPasskeyLoading}
                    label='地址'
                    placeholder='localhost'
                    radius='lg'
                    size='lg'
                    startContent={
                      <IoServerOutline className='text-black/50 mb-0.5 dark:text-white/90 text-slate-400 pointer-events-none flex-shrink-0' />
                    }
                    value={baseHost}
                    onChange={(e) => setBaseHost(e.target.value)}
                  />
                  <Input
                    isRequired
                    type='text'
                    name='basePort'
                    className='w-24'
                    classNames={{
                      label: 'text-black/50 dark:text-white/90',
                      input: [
                        'bg-transparent',
                        'text-black/90 dark:text-white/90',
                        'placeholder:text-default-700/50 dark:placeholder:text-white/60',
                      ],
                      innerWrapper: 'bg-transparent',
                      inputWrapper: [
                        'shadow-xl',
                        'bg-default-100/70',
                        'dark:bg-default/60',
                        'backdrop-blur-xl',
                        'backdrop-saturate-200',
                        'hover:bg-default-0/70',
                        'dark:hover:bg-default/70',
                        'group-data-[focus=true]:bg-default-100/50',
                        'dark:group-data-[focus=true]:bg-default/60',
                        '!cursor-text',
                      ],
                    }}
                    isDisabled={isLoading || isPasskeyLoading}
                    label='端口'
                    placeholder='6099'
                    radius='lg'
                    size='lg'
                    value={basePort}
                    onChange={(e) => setBasePort(e.target.value)}
                  />
                </div>
                <div className='text-center text-tiny text-default-500 mt-1'>
                  系统会自动添加 /api 路径
                </div>
                {window.location.protocol === 'https:' && baseProtocol === 'http' && (
                  <div className='text-center text-tiny text-warning-600 dark:text-warning-500 mt-1 font-bold cursor-pointer' onClick={onHelpOpen}>
                    ⚠️ 检测到 HTTPS 页面连接 HTTP 后端，可能导致连接失败，点击查看解决方法
                  </div>
                )}

                <div className='h-4' />

                {/* 隐藏的用户名字段，帮助浏览器识别登录表单 */}
                <input
                  type='text'
                  name='username'
                  value={`${baseHost}:${basePort}`}
                  autoComplete='username'
                  className='absolute -left-[9999px] opacity-0 pointer-events-none'
                  readOnly
                  tabIndex={-1}
                  aria-label='Username'
                />
                <Input
                  isRequired
                  isClearable
                  type='password'
                  name='password'
                  autoComplete='current-password'
                  classNames={{
                    label: 'text-black/50 dark:text-white/90',
                    input: [
                      'bg-transparent',
                      'text-black/90 dark:text-white/90',
                      'placeholder:text-default-700/50 dark:placeholder:text-white/60',
                    ],
                    innerWrapper: 'bg-transparent',
                    inputWrapper: [
                      'shadow-xl',
                      'bg-default-100/70',
                      'dark:bg-default/60',
                      'backdrop-blur-xl',
                      'backdrop-saturate-200',
                      'hover:bg-default-0/70',
                      'dark:hover:bg-default/70',
                      'group-data-[focus=true]:bg-default-100/50',
                      'dark:group-data-[focus=true]:bg-default/60',
                      '!cursor-text',
                    ],
                  }}
                  isDisabled={isLoading || isPasskeyLoading}
                  label='Token'
                  placeholder='请输入token'
                  radius='lg'
                  size='lg'
                  startContent={
                    <IoKeyOutline className='text-black/50 mb-0.5 dark:text-white/90 text-slate-400 pointer-events-none flex-shrink-0' />
                  }
                  value={tokenValue}
                  onChange={(e) => setTokenValue(e.target.value)}
                  onClear={() => setTokenValue('')}
                />

                <div className='h-5' />

                <div className='text-center text-small text-default-600 dark:text-default-400 px-2'>
                  💡 提示：请从 NapCat 启动日志中查看登录密钥
                </div>
                <div className='flex justify-center mt-2'>
                  <Link
                    color='warning'
                    className='text-small cursor-pointer'
                    onPress={onHelpOpen}
                  >
                    🔧 遇到网络错误？
                  </Link>
                </div>
                <Button
                  className='mx-10 mt-6 text-lg py-7'
                  color='primary'
                  isLoading={isLoading}
                  radius='full'
                  size='lg'
                  variant='shadow'
                  type='submit'
                >
                  {!isLoading && (
                    <Image
                      alt='logo'
                      classNames={{
                        wrapper: '-ml-8',
                      }}
                      height='2em'
                      src={logo}
                    />
                  )}
                  登录
                </Button>
              </form>
            </CardBody>
          </HoverEffectCard>
        </div>

        {/* 帮助弹窗 */}
        <Modal
          isOpen={isHelpOpen}
          onClose={onHelpClose}
          size='2xl'
          scrollBehavior='inside'
          backdrop='blur'
        >
          <ModalContent>
            <ModalHeader className='flex flex-col gap-1'>
              <div className='font-bold text-center text-lg'>🔧 遇到网络错误？</div>
            </ModalHeader>
            <ModalBody className='pb-6'>
              <div className='space-y-4'>
                <div className='p-4 bg-warning-50 dark:bg-warning-900/20 rounded-lg border border-warning-200 dark:border-warning-800'>
                  <p className='text-sm'>
                    由于浏览器安全限制，<Code>HTTPS</Code> 页面无法直接向 <Code>HTTP</Code> 后端发起请求。
                    如果您的 NapCat 后端使用 HTTP 协议，需要手动允许不安全的连接。
                  </p>
                </div>

                <div className='space-y-3'>
                  <h3 className='font-semibold text-base'>Chrome / Edge 浏览器设置方法：</h3>

                  <div className='space-y-2 text-sm'>
                    <div className='p-3 bg-default-100 dark:bg-default-50/10 rounded-lg'>
                      <p className='font-medium mb-2'>方法一：针对单一网站（推荐）</p>
                      <ol className='list-decimal list-inside space-y-1 text-default-600 dark:text-default-400'>
                        <li>点击浏览器地址栏左侧的锁图标（或 &quot;不安全&quot; 图标）</li>
                        <li>选择 &quot;网站设置&quot;</li>
                        <li>找到 &quot;不安全内容&quot; 选项</li>
                        <li>将其设置为 &quot;允许&quot;</li>
                        <li>刷新页面重试</li>
                      </ol>
                    </div>

                    <div className='p-3 bg-default-100 dark:bg-default-50/10 rounded-lg'>
                      <p className='font-medium mb-2'>方法二：使用 Chrome 标志（适用于开发）</p>
                      <ol className='list-decimal list-inside space-y-1 text-default-600 dark:text-default-400'>
                        <li>在地址栏输入 <Code>chrome://flags</Code></li>
                        <li>搜索 &quot;Insecure origins treated as secure&quot;</li>
                        <li>在输入框中添加您的后端地址，如 <Code>{`${baseProtocol}://${baseHost}:${basePort}`}</Code></li>
                        <li>将选项设置为 &quot;Enabled&quot;</li>
                        <li>点击 &quot;Relaunch&quot; 重启浏览器</li>
                      </ol>
                    </div>
                  </div>
                </div>

                <div className='space-y-3'>
                  <h3 className='font-semibold text-base'>其他解决方案：</h3>
                  <ul className='list-disc list-inside space-y-1 text-sm text-default-600 dark:text-default-400'>
                    <li>将本 WebUI 部署为 HTTP 协议访问</li>
                    <li>为 NapCat 后端配置 HTTPS 证书</li>
                    <li>使用反向代理（如 Nginx）统一协议</li>
                  </ul>
                </div>

                <div className='pt-2'>
                  <Link
                    isExternal
                    showAnchorIcon
                    href='https://blog.csdn.net/qq_17627195/article/details/129203873'
                    className='text-sm'
                  >
                    查看更详细的图文教程
                  </Link>
                </div>
              </div>
            </ModalBody>
          </ModalContent>
        </Modal>
      </PureLayout>
    </>
  );
}
