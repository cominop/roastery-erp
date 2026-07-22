// RichTextField — WYSIWYG editor for LONGTEXT fields using TipTap
import { useCallback, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { FormFieldProps } from './schema/controlSchema';

/**
 * Individual toolbar button for the TipTap editor.
 */
function ToolbarButton({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-xs rounded transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

export default function RichTextField({
  field,
  value,
  onChange,
  readOnly,
  error,
  tabIndex,
}: FormFieldProps) {
  const isReadOnly = readOnly ?? field.readOnly ?? false;
  const minHeight = field.rows ? `${field.rows * 28}px` : '150px';

  const htmlContent = typeof value === 'string' ? value : '';

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: field.placeholder || 'Write something…',
      }),
    ],
    content: htmlContent,
    editable: !isReadOnly,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      onChange(html === '<p></p>' ? '' : html);
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-sm max-w-none focus:outline-none px-3 py-2 min-h-[150px]',
        style: `min-height: ${minHeight}`,
        tabindex: String(tabIndex ?? field.tabIndex ?? 0),
      },
    },
    immediatelyRender: false,
  });

  const handleToolbarAction = useCallback(
    (action: (ed: NonNullable<typeof editor>) => void) => {
      if (editor) {
        action(editor);
        editor.chain().focus().run();
      }
    },
    [editor],
  );

  const toolbarButtons = useMemo(
    () => [
      {
        label: 'B',
        title: 'Bold',
        isActive: () => editor?.isActive('bold') ?? false,
        action: () => editor?.chain().focus().toggleBold().run(),
      },
      {
        label: 'I',
        title: 'Italic',
        isActive: () => editor?.isActive('italic') ?? false,
        action: () => editor?.chain().focus().toggleItalic().run(),
      },
      {
        label: 'S',
        title: 'Strike',
        isActive: () => editor?.isActive('strike') ?? false,
        action: () => editor?.chain().focus().toggleStrike().run(),
      },
      {
        label: 'H1',
        title: 'Heading 1',
        isActive: () => editor?.isActive('heading', { level: 1 }) ?? false,
        action: () =>
          editor?.chain().focus().toggleHeading({ level: 1 }).run(),
      },
      {
        label: 'H2',
        title: 'Heading 2',
        isActive: () => editor?.isActive('heading', { level: 2 }) ?? false,
        action: () =>
          editor?.chain().focus().toggleHeading({ level: 2 }).run(),
      },
      {
        label: '•',
        title: 'Bullet List',
        isActive: () => editor?.isActive('bulletList') ?? false,
        action: () => editor?.chain().focus().toggleBulletList().run(),
      },
      {
        label: '1.',
        title: 'Ordered List',
        isActive: () => editor?.isActive('orderedList') ?? false,
        action: () => editor?.chain().focus().toggleOrderedList().run(),
      },
      {
        label: '"',
        title: 'Blockquote',
        isActive: () => editor?.isActive('blockquote') ?? false,
        action: () => editor?.chain().focus().toggleBlockquote().run(),
      },
      {
        label: '<>',
        title: 'Code Block',
        isActive: () => editor?.isActive('codeBlock') ?? false,
        action: () => editor?.chain().focus().toggleCodeBlock().run(),
      },
    ],
    [editor],
  );

  return (
    <div className="flex flex-col gap-1">
      {field.caption && (
        <label
          htmlFor={field.id}
          className="text-xs font-medium text-foreground"
        >
          {field.caption}
          {field.required && (
            <span className="text-destructive ml-0.5">*</span>
          )}
        </label>
      )}

      {isReadOnly && htmlContent ? (
        // ── Read-only mode: render HTML as formatted text ──────────
        <div
          className="rounded-[var(--app-field-border-radius,6px)] border border-border bg-background px-3 py-2 prose prose-sm max-w-none"
          style={{ minHeight }}
          data-testid="richtext-readonly"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      ) : isReadOnly ? (
        // ── Read-only mode with no content ──────────────────────────
        <div
          className="rounded-[var(--app-field-border-radius,6px)] border border-border bg-background px-3 py-2 text-xs text-muted-foreground italic"
          style={{ minHeight }}
          data-testid="richtext-readonly"
        >
          No content
        </div>
      ) : (
        // ── Editable mode with toolbar ──────────────────────────────
        <div
          className="rounded-[var(--app-field-border-radius,6px)] border border-border overflow-hidden"
          data-testid="richtext-editor"
        >
          <div
            className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-2 py-1"
            data-testid="richtext-toolbar"
          >
            {toolbarButtons.map((btn) => (
              <ToolbarButton
                key={btn.title}
                label={btn.label}
                title={btn.title}
                active={btn.isActive()}
                onClick={() => handleToolbarAction(btn.action)}
              />
            ))}
          </div>
          <EditorContent editor={editor} />
        </div>
      )}

      {error ? (
        <p className="text-[10px] text-destructive" role="alert">
          {error}
        </p>
      ) : field.help ? (
        <p className="text-[10px] text-muted-foreground">{field.help}</p>
      ) : null}
    </div>
  );
}