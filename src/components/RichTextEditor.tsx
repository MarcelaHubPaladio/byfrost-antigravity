import { useEffect, useMemo } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Code,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function looksLikeHtml(s: string) {
  return /<\/?(p|br|ul|ol|li|strong|em|u|a|h[1-6]|blockquote|pre|code)\b/i.test(s);
}

function toEditorHtml(maybePlain: string) {
  const v = String(maybePlain ?? "").trim();
  if (!v) return "";
  if (looksLikeHtml(v)) return v;
  const html = escapeHtml(v).replaceAll("\n", "<br />");
  return `<p>${html}</p>`;
}

export function htmlTextContent(html: string) {
  if (typeof document === "undefined") return String(html ?? "");
  const el = document.createElement("div");
  el.innerHTML = String(html ?? "");
  return (el.textContent ?? "").replace(/\u00A0/g, " ");
}

export function normalizeRichTextHtmlOrNull(html: string) {
  const txt = htmlTextContent(html).trim();
  if (!txt) return null;
  return html;
}

export function RichTextEditor(props: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  minHeightClassName?: string;
  disabled?: boolean;
}) {
  const initial = useMemo(() => toEditorHtml(props.value), [props.value]);

  const editor = useEditor({
    editable: !props.disabled,
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Placeholder.configure({
        placeholder: props.placeholder ?? "",
      }),
    ],
    content: initial,
    onUpdate: ({ editor }) => {
      props.onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none",
          "prose-p:my-2 prose-ul:my-2 prose-ol:my-2",
          "prose-li:my-0",
          "text-slate-900",
          props.minHeightClassName ?? "min-h-[120px]",
          props.editorClassName
        ),
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const next = toEditorHtml(props.value);
    const current = editor.getHTML();
    if (current === next) return;
    // Mantém a posição do cursor quando possível.
    editor.commands.setContent(next, false);
  }, [editor, props.value]);

  if (!editor) return null;

  const iconCls = "h-4 w-4";
  const btnCls = "h-9 rounded-xl px-2";

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link (URL)", prev ?? "");
    if (url === null) return;
    const trimmed = url.trim();
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
  };

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-white", props.className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50/60 px-2 py-2">
        <Button
          type="button"
          variant={editor.isActive("bold") ? "default" : "secondary"}
          className={cn(btnCls, editor.isActive("bold") ? "bg-slate-900 text-white" : "")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={props.disabled}
          title="Negrito"
        >
          <Bold className={iconCls} />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("italic") ? "default" : "secondary"}
          className={cn(btnCls, editor.isActive("italic") ? "bg-slate-900 text-white" : "")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={props.disabled}
          title="Itálico"
        >
          <Italic className={iconCls} />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("underline") ? "default" : "secondary"}
          className={cn(btnCls, editor.isActive("underline") ? "bg-slate-900 text-white" : "")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={props.disabled}
          title="Sublinhado"
        >
          <UnderlineIcon className={iconCls} />
        </Button>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <Button
          type="button"
          variant={editor.isActive("bulletList") ? "default" : "secondary"}
          className={cn(btnCls, editor.isActive("bulletList") ? "bg-slate-900 text-white" : "")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={props.disabled}
          title="Lista"
        >
          <List className={iconCls} />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("orderedList") ? "default" : "secondary"}
          className={cn(btnCls, editor.isActive("orderedList") ? "bg-slate-900 text-white" : "")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={props.disabled}
          title="Lista numerada"
        >
          <ListOrdered className={iconCls} />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("blockquote") ? "default" : "secondary"}
          className={cn(btnCls, editor.isActive("blockquote") ? "bg-slate-900 text-white" : "")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          disabled={props.disabled}
          title="Citação"
        >
          <Quote className={iconCls} />
        </Button>
        <Button
          type="button"
          variant={editor.isActive("codeBlock") ? "default" : "secondary"}
          className={cn(btnCls, editor.isActive("codeBlock") ? "bg-slate-900 text-white" : "")}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          disabled={props.disabled}
          title="Bloco de código"
        >
          <Code className={iconCls} />
        </Button>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <Button
          type="button"
          variant={editor.isActive("link") ? "default" : "secondary"}
          className={cn(btnCls, editor.isActive("link") ? "bg-slate-900 text-white" : "")}
          onClick={setLink}
          disabled={props.disabled}
          title="Link"
        >
          <Link2 className={iconCls} />
        </Button>
        <div className="mx-1 h-6 w-px bg-slate-200" />
        <Button
          type="button"
          variant="secondary"
          className={btnCls}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={props.disabled || !editor.can().undo()}
          title="Desfazer"
        >
          <Undo2 className={iconCls} />
        </Button>
        <Button
          type="button"
          variant="secondary"
          className={btnCls}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={props.disabled || !editor.can().redo()}
          title="Refazer"
        >
          <Redo2 className={iconCls} />
        </Button>
      </div>

      <div className="px-3 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
