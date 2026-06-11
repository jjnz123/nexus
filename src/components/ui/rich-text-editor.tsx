"use client";

import { useEffect, useState } from "react";
import { Extension } from "@tiptap/core";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Palette,
  Strikethrough,
  Type,
  Underline as UnderlineIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (size: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const FontSize = Extension.create({
  name: "fontSize",
  addOptions() {
    return { types: ["textStyle"] as const };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, "") || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

const TEXT_COLORS = [
  { label: "Default", value: "default" },
  { label: "Red", value: "#ef4444" },
  { label: "Orange", value: "#f97316" },
  { label: "Green", value: "#22c55e" },
  { label: "Blue", value: "#3b82f6" },
  { label: "Purple", value: "#a855f7" },
  { label: "Muted", value: "#94a3b8" },
];

const FONT_SIZES = [
  { label: "Small", value: "0.875rem" },
  { label: "Normal", value: "1rem" },
  { label: "Large", value: "1.25rem" },
  { label: "Extra large", value: "1.5rem" },
];

function ToolbarButton({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant={active ? "secondary" : "ghost"}
      className="h-8 w-8 shrink-0"
      onMouseDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      title={title}
    >
      {children}
    </Button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 180,
  className,
  onHeightChange,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
  onHeightChange?: (height: number) => void;
}) {
  const [, setRevision] = useState(0);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      TextStyle,
      Color,
      FontSize,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class:
          "tiptap-content max-w-none min-h-[120px] px-3 py-2 text-sm focus:outline-none",
      },
    },
    onUpdate: ({ editor: current }) => {
      const html = current.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
    onSelectionUpdate: () => setRevision((current) => current + 1),
    onTransaction: () => setRevision((current) => current + 1),
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    const normalized = value || "";
    const currentNormalized = current === "<p></p>" ? "" : current;
    if (normalized !== currentNormalized) {
      editor.commands.setContent(normalized || "", { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div
        className={cn("rounded-md border bg-muted/20", className)}
        style={{ minHeight }}
      />
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-md border bg-background", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold (Ctrl+B)"
        >
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic (Ctrl+I)"
        >
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          title="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          title="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          title="Heading 3"
        >
          <Heading3 className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="Bullet list"
        >
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <span className="mx-1 h-5 w-px bg-border" />
        <Select
          onValueChange={(size) => {
            if (size === "default") editor.chain().focus().unsetFontSize().run();
            else editor.chain().focus().setFontSize(size).run();
          }}
        >
          <SelectTrigger className="h-8 w-[110px] gap-1 border-0 bg-transparent px-2 shadow-none">
            <Type className="h-3.5 w-3.5" />
            <SelectValue placeholder="Size" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Normal</SelectItem>
            {FONT_SIZES.map((size) => (
              <SelectItem key={size.value} value={size.value}>
                {size.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          onValueChange={(color) => {
            if (color === "default") editor.chain().focus().unsetColor().run();
            else editor.chain().focus().setColor(color).run();
          }}
        >
          <SelectTrigger className="h-8 w-[100px] gap-1 border-0 bg-transparent px-2 shadow-none">
            <Palette className="h-3.5 w-3.5" />
            <SelectValue placeholder="Color" />
          </SelectTrigger>
          <SelectContent>
            {TEXT_COLORS.map((color) => (
              <SelectItem key={color.label} value={color.value}>
                <span className="flex items-center gap-2">
                  {color.value !== "default" ? (
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: color.value }}
                    />
                  ) : null}
                  {color.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div
        className="relative resize-y overflow-auto"
        style={{ minHeight, height: minHeight }}
        onMouseUp={(event) => {
          onHeightChange?.(event.currentTarget.offsetHeight);
        }}
      >
        <EditorContent editor={editor} />
        {!editor.getText().trim() && placeholder ? (
          <p className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </p>
        ) : null}
      </div>
    </div>
  );
}
