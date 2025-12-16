import React, { useState, useRef } from 'react';
import { X } from 'lucide-react';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import type { Theme, Session, Group } from '../types';
import { MODAL_PRIORITIES } from '../constants/modalPriorities';
import { Modal, ModalFooter } from './ui/Modal';

interface CreateGroupModalProps {
  theme: Theme;
  onClose: () => void;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
  sessions: Session[];
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  activeSessionId: string;
  moveSessionToNewGroup: boolean;
  setMoveSessionToNewGroup: (move: boolean) => void;
}

export function CreateGroupModal(props: CreateGroupModalProps) {
  const {
    theme, onClose, groups, setGroups, sessions, setSessions,
    activeSessionId, moveSessionToNewGroup, setMoveSessionToNewGroup
  } = props;

  const [groupName, setGroupName] = useState('');
  const [groupEmoji, setGroupEmoji] = useState('📂');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    if (groupName.trim()) {
      const newGroup: Group = {
        id: `group-${Date.now()}`,
        name: groupName.trim().toUpperCase(),
        emoji: groupEmoji,
        collapsed: false
      };
      setGroups([...groups, newGroup]);

      // If we should move the session to the new group
      if (moveSessionToNewGroup) {
        setSessions(prev => prev.map(s =>
          s.id === activeSessionId ? { ...s, groupId: newGroup.id } : s
        ));
      }

      setGroupName('');
      setGroupEmoji('📂');
      setEmojiPickerOpen(false);
      setMoveSessionToNewGroup(false);
      onClose();
    }
  };

  return (
    <Modal
      theme={theme}
      title="Create New Group"
      priority={MODAL_PRIORITIES.CREATE_GROUP}
      onClose={onClose}
      initialFocusRef={inputRef}
      footer={
        <ModalFooter
          theme={theme}
          onCancel={onClose}
          onConfirm={handleCreate}
          confirmLabel="Create"
          confirmDisabled={!groupName.trim()}
        />
      }
    >
      <div className="flex gap-4 items-end">
        {/* Emoji Selector - Left Side */}
        <div className="flex flex-col gap-2">
          <label className="block text-xs font-bold opacity-70 uppercase" style={{ color: theme.colors.textMain }}>
            Icon
          </label>
          <button
            onClick={() => setEmojiPickerOpen(!emojiPickerOpen)}
            className="p-3 rounded border bg-transparent text-3xl hover:bg-white/5 transition-colors w-16 h-[52px] flex items-center justify-center"
            style={{ borderColor: theme.colors.border }}
            type="button"
          >
            {groupEmoji}
          </button>
        </div>

        {/* Group Name Input - Right Side */}
        <div className="flex-1 flex flex-col gap-2">
          <label className="block text-xs font-bold opacity-70 uppercase" style={{ color: theme.colors.textMain }}>
            Group Name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="Enter group name..."
            className="w-full p-3 rounded border bg-transparent outline-none h-[52px]"
            style={{ borderColor: theme.colors.border, color: theme.colors.textMain }}
            autoFocus
          />
        </div>
      </div>

      {/* Emoji Picker Overlay - Internal to modal, not a separate layer */}
      {emojiPickerOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60]"
          onClick={() => {
            setEmojiPickerOpen(false);
            inputRef.current?.focus();
          }}
          onKeyDown={(e) => {
            // Keep internal emoji picker escape handler
            // This closes the emoji picker, not the modal
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setEmojiPickerOpen(false);
              inputRef.current?.focus();
            }
          }}
          tabIndex={0}
          ref={(el) => el?.focus()}
        >
          <div
            className="rounded-lg border-2 shadow-2xl overflow-visible relative"
            style={{ borderColor: theme.colors.accent, backgroundColor: theme.colors.bgSidebar }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => {
                setEmojiPickerOpen(false);
                inputRef.current?.focus();
              }}
              className="absolute -top-3 -right-3 z-10 p-2 rounded-full shadow-lg hover:scale-110 transition-transform"
              style={{ backgroundColor: theme.colors.bgSidebar, color: theme.colors.textMain, border: `2px solid ${theme.colors.border}` }}
            >
              <X className="w-4 h-4" />
            </button>
            <Picker
              data={data}
              onEmojiSelect={(emoji: any) => {
                setGroupEmoji(emoji.native);
                setEmojiPickerOpen(false);
                inputRef.current?.focus();
              }}
              theme={theme.mode}
              previewPosition="none"
              searchPosition="sticky"
              perLine={9}
              set="native"
              autoFocus
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
