import { createContext, useContext, type ReactNode } from 'react'

export type Language = 'zh' | 'en'

const zh: Record<string, string> = {
  'Local Color Workspace': '本地调色工作台',
  'Color Workspace': '调色工作台',
  'Style Learning': '风格学习',
  'Desktop RAW engine': '桌面 RAW 引擎',
  'Browser preview mode': '浏览器预览模式',
  'Test engine': '测试引擎',
  'Input Photo': '输入照片',
  'LUT Source': 'LUT 来源',
  'Official LUTs': '官方 LUT',
  'Mine': '我的',
  'Reference LUT': '参考 LUT',
  'Restore Original': '恢复原图',
  'No LUT': '无 LUT',
  'Original': '原图',
  'Result': '效果',
  'Compare': '对比',
  'Brush': '画笔',
  'Erase': '橡皮擦',
  'Hide Mask': '隐藏蒙版',
  'Show Mask': '显示蒙版',
  'Clear Mask': '清空蒙版',
  'Person Detection': '人物检测',
  'Disable Person Edit': '关闭人物编辑',
  'Detecting...': '检测中…',
  'Rotate left': '向左旋转',
  'Rotate right': '向右旋转',
  'Export Preview': '导出预览',
  'Saving...': '保存中…',
  'HSL Color Mixer': 'HSL 色彩混合器',
  'Selective colour': '选择性色彩',
  'Color Grading': '色彩分级',
  'Light zones': '明度区域',
  'Local Mask Layers': '局部蒙版图层',
  'New Mask': '新建蒙版',
  'Delete': '删除',
  'Reset': '重置',
  'Painted': '已绘制',
  'Empty': '空',
  'Brush Size': '画笔大小',
  'Brush Feather': '画笔羽化',
  'Current Analysis': '当前分析',
  'Export History': '导出历史',
  'Waiting': '等待中',
  'Ready': '就绪',
  'Failed': '失败',
  'Rendering...': '渲染中…',
  'Analyzing...': '分析中…',
  'Loaded': '已载入',
  'Reading RAW...': '正在读取 RAW…',
  'Open RAW or photo from computer': '从电脑打开 RAW 或照片',
  'Test desktop engine': '测试桌面引擎',
  'Drop or click to upload a photo': '拖放或点击上传照片',
  'No photo selected': '尚未选择照片',
  'Language': '语言',
  'Training Pair': '训练图片对',
  'Need 2 images': '需要两张图片',
  'Upload Original Photo': '上传原始照片',
  'Before color grading': '调色之前',
  'Upload Edited Photo': '上传调色后照片',
  'After color grading': '调色之后',
  'Learn As': '学习方式',
  'Style Name': '风格名称',
  'Required': '必填',
  'Edited': '调色后',
  'Auto Align': '自动对齐',
  'Generate LUT': '生成 LUT',
  'Save Style': '保存风格',
  'Learning Summary': '学习摘要',
  'Pair ready': '图片对已就绪',
  'Learned Difference': '学习到的差异',
  'Preview': '预览',
  'Generation Rules': '生成规则',
  'Safety': '安全保护',
}

type LanguageContextValue = {
  language: Language
  t: (text: string) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  t: (text) => text,
})

export function LanguageProvider({
  language,
  children,
}: {
  language: Language
  children: ReactNode
}) {
  return (
    <LanguageContext.Provider
      value={{ language, t: (text) => (language === 'zh' ? zh[text] ?? text : text) }}
    >
      {children}
    </LanguageContext.Provider>
  )
}

export const useLanguage = () => useContext(LanguageContext)
