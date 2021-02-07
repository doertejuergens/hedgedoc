/*
 * SPDX-FileCopyrightText: 2021 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LoggerModule } from '../logger/logger.module';
import { Authorship } from '../revisions/authorship.entity';
import { Revision } from '../revisions/revision.entity';
import { RevisionsModule } from '../revisions/revisions.module';
import { AuthToken } from '../auth/auth-token.entity';
import { Identity } from '../users/identity.entity';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { AuthorColor } from './author-color.entity';
import { Note } from './note.entity';
import { NotesService } from './notes.service';
import { Repository } from 'typeorm';
import { Tag } from './tag.entity';
import { NotInDBError, PermissionsUpdateInconsistent } from '../errors/errors';
import {
  NoteGroupPermissionUpdateDto,
  NoteUserPermissionUpdateDto,
} from './note-permissions.dto';
import { Group } from '../groups/group.entity';

describe('NotesService', () => {
  let service: NotesService;
  let noteRepo: Repository<Note>;
  let revisionRepo: Repository<Revision>;
  let userRepo: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        {
          provide: getRepositoryToken(Note),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Tag),
          useClass: Repository,
        },
      ],
      imports: [LoggerModule, UsersModule, RevisionsModule],
    })
      .overrideProvider(getRepositoryToken(Note))
      .useClass(Repository)
      .overrideProvider(getRepositoryToken(Tag))
      .useClass(Repository)
      .overrideProvider(getRepositoryToken(User))
      .useClass(Repository)
      .overrideProvider(getRepositoryToken(AuthToken))
      .useValue({})
      .overrideProvider(getRepositoryToken(Identity))
      .useValue({})
      .overrideProvider(getRepositoryToken(Authorship))
      .useValue({})
      .overrideProvider(getRepositoryToken(AuthorColor))
      .useValue({})
      .overrideProvider(getRepositoryToken(Revision))
      .useClass(Repository)
      .compile();

    service = module.get<NotesService>(NotesService);
    noteRepo = module.get<Repository<Note>>(getRepositoryToken(Note));
    revisionRepo = module.get<Repository<Revision>>(
      getRepositoryToken(Revision),
    );
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUserNotes', () => {
    describe('works', () => {
      const user = {} as User;
      const alias = 'alias';
      const note = Note.create(user, alias);

      it('with one note', async () => {
        jest.spyOn(noteRepo, 'find').mockResolvedValueOnce(undefined);
        const notes = await service.getUserNotes(user);
        expect(notes).toEqual([]);
      });

      it('with one note', async () => {
        jest.spyOn(noteRepo, 'find').mockResolvedValueOnce([note]);
        const notes = await service.getUserNotes(user);
        expect(notes).toEqual([note]);
      });

      it('with multiple note', async () => {
        jest.spyOn(noteRepo, 'find').mockResolvedValueOnce([note, note]);
        const notes = await service.getUserNotes(user);
        expect(notes).toEqual([note, note]);
      });
    });
  });

  describe('createNote', () => {
    describe('works', () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const alias = 'alias';
      const content = 'testContent';
      it('without alias, without owner', async () => {
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementation(async (note: Note): Promise<Note> => note);
        const newNote = await service.createNote(content);
        const revisions = await newNote.revisions;
        expect(revisions).toHaveLength(1);
        expect(revisions[0].content).toEqual(content);
        expect(newNote.historyEntries).toBeUndefined();
        expect(newNote.userPermissions).toHaveLength(0);
        expect(newNote.groupPermissions).toHaveLength(0);
        expect(newNote.tags).toHaveLength(0);
        expect(newNote.owner).toBeUndefined();
        expect(newNote.alias).toBeUndefined();
      });
      it('without alias, with owner', async () => {
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementation(async (note: Note): Promise<Note> => note);
        const newNote = await service.createNote(content, undefined, user);
        const revisions = await newNote.revisions;
        expect(revisions).toHaveLength(1);
        expect(revisions[0].content).toEqual(content);
        expect(newNote.historyEntries).toHaveLength(1);
        expect(newNote.historyEntries[0].user).toEqual(user);
        expect(newNote.userPermissions).toHaveLength(0);
        expect(newNote.groupPermissions).toHaveLength(0);
        expect(newNote.tags).toHaveLength(0);
        expect(newNote.owner).toEqual(user);
        expect(newNote.alias).toBeUndefined();
      });
      it('with alias, without owner', async () => {
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementation(async (note: Note): Promise<Note> => note);
        const newNote = await service.createNote(content, alias);
        const revisions = await newNote.revisions;
        expect(revisions).toHaveLength(1);
        expect(revisions[0].content).toEqual(content);
        expect(newNote.historyEntries).toBeUndefined();
        expect(newNote.userPermissions).toHaveLength(0);
        expect(newNote.groupPermissions).toHaveLength(0);
        expect(newNote.tags).toHaveLength(0);
        expect(newNote.owner).toBeUndefined();
        expect(newNote.alias).toEqual(alias);
      });
      it('with alias, with owner', async () => {
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementation(async (note: Note): Promise<Note> => note);
        const newNote = await service.createNote(content, alias, user);
        const revisions = await newNote.revisions;
        expect(revisions).toHaveLength(1);
        expect(revisions[0].content).toEqual(content);
        expect(newNote.historyEntries).toHaveLength(1);
        expect(newNote.historyEntries[0].user).toEqual(user);
        expect(newNote.userPermissions).toHaveLength(0);
        expect(newNote.groupPermissions).toHaveLength(0);
        expect(newNote.tags).toHaveLength(0);
        expect(newNote.owner).toEqual(user);
        expect(newNote.alias).toEqual(alias);
      });
    });
  });

  describe('getNoteContentByNote', () => {
    it('works', async () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const content = 'testContent';
      jest
        .spyOn(noteRepo, 'save')
        .mockImplementation(async (note: Note): Promise<Note> => note);
      const newNote = await service.createNote(content);
      const revisions = await newNote.revisions;
      jest.spyOn(revisionRepo, 'findOne').mockResolvedValueOnce(revisions[0]);
      service.getNoteContentByNote(newNote).then((result) => {
        expect(result).toEqual(content);
      });
    });
  });

  describe('getLatestRevision', () => {
    it('works', async () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const content = 'testContent';
      jest
        .spyOn(noteRepo, 'save')
        .mockImplementation(async (note: Note): Promise<Note> => note);
      const newNote = await service.createNote(content);
      const revisions = await newNote.revisions;
      jest.spyOn(revisionRepo, 'findOne').mockResolvedValueOnce(revisions[0]);
      service.getLatestRevision(newNote).then((result) => {
        expect(result).toEqual(revisions[0]);
      });
    });
  });

  describe('getFirstRevision', () => {
    it('works', async () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const content = 'testContent';
      jest
        .spyOn(noteRepo, 'save')
        .mockImplementation(async (note: Note): Promise<Note> => note);
      const newNote = await service.createNote(content);
      const revisions = await newNote.revisions;
      jest.spyOn(revisionRepo, 'findOne').mockResolvedValueOnce(revisions[0]);
      service.getLatestRevision(newNote).then((result) => {
        expect(result).toEqual(revisions[0]);
      });
    });
  });

  describe('getNoteByIdOrAlias', () => {
    it('works', async () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const note = Note.create(user);
      jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
      const foundNote = await service.getNoteByIdOrAlias('noteThatExists');
      expect(foundNote).toEqual(note);
    });
    it('fails: no note found', async () => {
      jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(undefined);
      try {
        await service.getNoteByIdOrAlias('noteThatDoesNoteExist');
      } catch (e) {
        expect(e).toBeInstanceOf(NotInDBError);
      }
    });
  });

  describe('deleteNoteByIdOrAlias', () => {
    it('works', async () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const note = Note.create(user);
      jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
      jest
        .spyOn(noteRepo, 'remove')
        .mockImplementationOnce(async (entry, _) => {
          expect(entry).toEqual(note);
          return entry;
        });
      await service.deleteNoteByIdOrAlias('noteThatExists');
    });
  });

  describe('updateNoteByIdOrAlias', () => {
    it('works', async () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const note = Note.create(user);
      const revisionLength = (await note.revisions).length;
      jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
      jest
        .spyOn(noteRepo, 'save')
        .mockImplementationOnce(async (entry: Note) => {
          return entry;
        });
      const updatedNote = await service.updateNoteByIdOrAlias(
        'noteThatExists',
        'newContent',
      );
      expect(await updatedNote.revisions).toHaveLength(revisionLength + 1);
    });
  });

  describe('updateNotePermissions', () => {
    const userPermissionUpdate = new NoteUserPermissionUpdateDto();
    userPermissionUpdate.username = 'hardcoded';
    userPermissionUpdate.canEdit = true;
    const groupPermissionUpate = new NoteGroupPermissionUpdateDto();
    groupPermissionUpate.groupname = 'testGroup';
    groupPermissionUpate.canEdit = false;
    const user = {} as User;
    user.userName = userPermissionUpdate.username;
    const group = {} as Group;
    group.displayName = groupPermissionUpate.groupname;
    const note = Note.create(user);
    describe('works', () => {
      it('with empty GroupPermissions and with empty UserPermissions', async () => {
        jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementationOnce(async (entry: Note) => {
            return entry;
          });
        const savedNote = await service.updateNotePermissions(
          'noteThatExists',
          {
            sharedToUsers: [],
            sharedToGroups: [],
          },
        );
        expect(savedNote.userPermissions).toHaveLength(0);
        expect(savedNote.groupPermissions).toHaveLength(0);
      });
      it('with empty GroupPermissions and with new UserPermissions', async () => {
        jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementationOnce(async (entry: Note) => {
            return entry;
          });
        jest.spyOn(userRepo, 'findOne').mockResolvedValueOnce(user);
        const savedNote = await service.updateNotePermissions(
          'noteThatExists',
          {
            sharedToUsers: [userPermissionUpdate],
            sharedToGroups: [],
          },
        );
        expect(savedNote.userPermissions).toHaveLength(1);
        expect(savedNote.userPermissions[0].user.userName).toEqual(
          userPermissionUpdate.username,
        );
        expect(savedNote.userPermissions[0].canEdit).toEqual(
          userPermissionUpdate.canEdit,
        );
        expect(savedNote.groupPermissions).toHaveLength(0);
      });
      it('with empty GroupPermissions and with existing UserPermissions', async () => {
        const noteWithPreexistingPermissions: Note = { ...note };
        noteWithPreexistingPermissions.userPermissions = [
          {
            note: noteWithPreexistingPermissions,
            user: user,
            canEdit: !userPermissionUpdate.canEdit,
          },
        ];
        jest
          .spyOn(noteRepo, 'findOne')
          .mockResolvedValueOnce(noteWithPreexistingPermissions);
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementationOnce(async (entry: Note) => {
            return entry;
          });
        jest.spyOn(userRepo, 'findOne').mockResolvedValueOnce(user);
        const savedNote = await service.updateNotePermissions(
          'noteThatExists',
          {
            sharedToUsers: [userPermissionUpdate],
            sharedToGroups: [],
          },
        );
        expect(savedNote.userPermissions).toHaveLength(1);
        expect(savedNote.userPermissions[0].user.userName).toEqual(
          userPermissionUpdate.username,
        );
        expect(savedNote.userPermissions[0].canEdit).toEqual(
          userPermissionUpdate.canEdit,
        );
        expect(savedNote.groupPermissions).toHaveLength(0);
      });
      it.skip('with new GroupPermissions and with empty UserPermissions', async () => {
        jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementationOnce(async (entry: Note) => {
            return entry;
          });
        const savedNote = await service.updateNotePermissions(
          'noteThatExists',
          {
            sharedToUsers: [],
            sharedToGroups: [groupPermissionUpate],
          },
        );
        expect(savedNote.userPermissions).toHaveLength(0);
        expect(savedNote.groupPermissions[0].group.displayName).toEqual(
          groupPermissionUpate.groupname,
        );
        expect(savedNote.groupPermissions[0].canEdit).toEqual(
          groupPermissionUpate.canEdit,
        );
      });
      it.skip('with new GroupPermissions and with new UserPermissions', async () => {
        jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementationOnce(async (entry: Note) => {
            return entry;
          });
        jest.spyOn(userRepo, 'findOne').mockResolvedValueOnce(user);
        const savedNote = await service.updateNotePermissions(
          'noteThatExists',
          {
            sharedToUsers: [userPermissionUpdate],
            sharedToGroups: [groupPermissionUpate],
          },
        );
        expect(savedNote.userPermissions[0].user.userName).toEqual(
          userPermissionUpdate.username,
        );
        expect(savedNote.userPermissions[0].canEdit).toEqual(
          userPermissionUpdate.canEdit,
        );
        expect(savedNote.groupPermissions[0].group.displayName).toEqual(
          groupPermissionUpate.groupname,
        );
        expect(savedNote.groupPermissions[0].canEdit).toEqual(
          groupPermissionUpate.canEdit,
        );
      });
      it.skip('with new GroupPermissions and with existing UserPermissions', async () => {
        const noteWithUserPermission: Note = { ...note };
        noteWithUserPermission.userPermissions = [
          {
            note: noteWithUserPermission,
            user: user,
            canEdit: !userPermissionUpdate.canEdit,
          },
        ];
        jest
          .spyOn(noteRepo, 'findOne')
          .mockResolvedValueOnce(noteWithUserPermission);
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementationOnce(async (entry: Note) => {
            return entry;
          });
        jest.spyOn(userRepo, 'findOne').mockResolvedValueOnce(user);
        const savedNote = await service.updateNotePermissions(
          'noteThatExists',
          {
            sharedToUsers: [userPermissionUpdate],
            sharedToGroups: [groupPermissionUpate],
          },
        );
        expect(savedNote.userPermissions[0].user.userName).toEqual(
          userPermissionUpdate.username,
        );
        expect(savedNote.userPermissions[0].canEdit).toEqual(
          userPermissionUpdate.canEdit,
        );
        expect(savedNote.groupPermissions[0].group.displayName).toEqual(
          groupPermissionUpate.groupname,
        );
        expect(savedNote.groupPermissions[0].canEdit).toEqual(
          groupPermissionUpate.canEdit,
        );
      });
      it('with existing GroupPermissions and with empty UserPermissions', async () => {
        const noteWithPreexistingPermissions: Note = { ...note };
        noteWithPreexistingPermissions.groupPermissions = [
          {
            note: noteWithPreexistingPermissions,
            group: group,
            canEdit: !groupPermissionUpate.canEdit,
          },
        ];
        jest
          .spyOn(noteRepo, 'findOne')
          .mockResolvedValueOnce(noteWithPreexistingPermissions);
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementationOnce(async (entry: Note) => {
            return entry;
          });
        const savedNote = await service.updateNotePermissions(
          'noteThatExists',
          {
            sharedToUsers: [],
            sharedToGroups: [groupPermissionUpate],
          },
        );
        expect(savedNote.userPermissions).toHaveLength(0);
        expect(savedNote.groupPermissions[0].group.displayName).toEqual(
          groupPermissionUpate.groupname,
        );
        expect(savedNote.groupPermissions[0].canEdit).toEqual(
          groupPermissionUpate.canEdit,
        );
      });
      it('with existing GroupPermissions and with new UserPermissions', async () => {
        const noteWithPreexistingPermissions: Note = { ...note };
        noteWithPreexistingPermissions.groupPermissions = [
          {
            note: noteWithPreexistingPermissions,
            group: group,
            canEdit: !groupPermissionUpate.canEdit,
          },
        ];
        jest
          .spyOn(noteRepo, 'findOne')
          .mockResolvedValueOnce(noteWithPreexistingPermissions);
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementationOnce(async (entry: Note) => {
            return entry;
          });
        jest.spyOn(userRepo, 'findOne').mockResolvedValueOnce(user);
        const savedNote = await service.updateNotePermissions(
          'noteThatExists',
          {
            sharedToUsers: [userPermissionUpdate],
            sharedToGroups: [groupPermissionUpate],
          },
        );
        expect(savedNote.userPermissions[0].user.userName).toEqual(
          userPermissionUpdate.username,
        );
        expect(savedNote.userPermissions[0].canEdit).toEqual(
          userPermissionUpdate.canEdit,
        );
        expect(savedNote.groupPermissions[0].group.displayName).toEqual(
          groupPermissionUpate.groupname,
        );
        expect(savedNote.groupPermissions[0].canEdit).toEqual(
          groupPermissionUpate.canEdit,
        );
      });
      it('with existing GroupPermissions and with existing UserPermissions', async () => {
        const noteWithPreexistingPermissions: Note = { ...note };
        noteWithPreexistingPermissions.groupPermissions = [
          {
            note: noteWithPreexistingPermissions,
            group: group,
            canEdit: !groupPermissionUpate.canEdit,
          },
        ];
        noteWithPreexistingPermissions.userPermissions = [
          {
            note: noteWithPreexistingPermissions,
            user: user,
            canEdit: !userPermissionUpdate.canEdit,
          },
        ];
        jest
          .spyOn(noteRepo, 'findOne')
          .mockResolvedValueOnce(noteWithPreexistingPermissions);
        jest
          .spyOn(noteRepo, 'save')
          .mockImplementationOnce(async (entry: Note) => {
            return entry;
          });
        jest.spyOn(userRepo, 'findOne').mockResolvedValueOnce(user);
        const savedNote = await service.updateNotePermissions(
          'noteThatExists',
          {
            sharedToUsers: [userPermissionUpdate],
            sharedToGroups: [groupPermissionUpate],
          },
        );
        expect(savedNote.userPermissions[0].user.userName).toEqual(
          userPermissionUpdate.username,
        );
        expect(savedNote.userPermissions[0].canEdit).toEqual(
          userPermissionUpdate.canEdit,
        );
        expect(savedNote.groupPermissions[0].group.displayName).toEqual(
          groupPermissionUpate.groupname,
        );
        expect(savedNote.groupPermissions[0].canEdit).toEqual(
          groupPermissionUpate.canEdit,
        );
      });
    });
    describe('fails:', () => {
      it('userPermissions has duplicate entries', async () => {
        jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
        try {
          await service.updateNotePermissions('noteThatExists', {
            sharedToUsers: [userPermissionUpdate, userPermissionUpdate],
            sharedToGroups: [],
          });
        } catch (e) {
          expect(e).toBeInstanceOf(PermissionsUpdateInconsistent);
        }
      });

      it('groupPermissions has duplicate entries', async () => {
        jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
        try {
          await service.updateNotePermissions('noteThatExists', {
            sharedToUsers: [],
            sharedToGroups: [groupPermissionUpate, groupPermissionUpate],
          });
        } catch (e) {
          expect(e).toBeInstanceOf(PermissionsUpdateInconsistent);
        }
      });

      it('userPermissions and groupPermissions have duplicate entries', async () => {
        jest.spyOn(noteRepo, 'findOne').mockResolvedValueOnce(note);
        try {
          await service.updateNotePermissions('noteThatExists', {
            sharedToUsers: [userPermissionUpdate, userPermissionUpdate],
            sharedToGroups: [groupPermissionUpate, groupPermissionUpate],
          });
        } catch (e) {
          expect(e).toBeInstanceOf(PermissionsUpdateInconsistent);
        }
      });
    });
  });

  describe('getNoteContentByIdOrAlias', () => {
    it('works', async () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const content = 'testContent';
      jest
        .spyOn(noteRepo, 'save')
        .mockImplementation(async (note: Note): Promise<Note> => note);
      const newNote = await service.createNote(content);
      const revisions = await newNote.revisions;
      jest.spyOn(revisionRepo, 'findOne').mockResolvedValueOnce(revisions[0]);
      service.getNoteContentByIdOrAlias('noteThatExists').then((result) => {
        expect(result).toEqual(content);
      });
    });
  });

  describe('toTagList', () => {
    it('works', async () => {
      const note = {} as Note;
      note.tags = [
        {
          id: 1,
          name: 'testTag',
          notes: [note],
        },
      ];
      const tagList = service.toTagList(note);
      expect(tagList).toHaveLength(1);
      expect(tagList[0]).toEqual(note.tags[0].name);
    });
  });

  describe('toNotePermissionsDto', () => {
    it('works', async () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const group = {} as Group;
      group.displayName = 'testGroup';
      const note = Note.create(user);
      note.userPermissions = [
        {
          note: note,
          user: user,
          canEdit: true,
        },
      ];
      note.groupPermissions = [
        {
          note: note,
          group: group,
          canEdit: true,
        },
      ];
      const permissions = await service.toNotePermissionsDto(note);
      expect(permissions.owner.userName).toEqual(user.userName);
      expect(permissions.sharedToUsers).toHaveLength(1);
      expect(permissions.sharedToUsers[0].user.userName).toEqual(user.userName);
      expect(permissions.sharedToUsers[0].canEdit).toEqual(true);
      expect(permissions.sharedToGroups).toHaveLength(1);
      expect(permissions.sharedToGroups[0].group.displayName).toEqual(
        group.displayName,
      );
      expect(permissions.sharedToGroups[0].canEdit).toEqual(true);
    });
  });

  describe('toNoteMetadataDto', () => {
    it('works', async () => {
      const user = {} as User;
      user.userName = 'hardcoded';
      const group = {} as Group;
      group.displayName = 'testGroup';
      const content = 'testContent';
      jest
        .spyOn(noteRepo, 'save')
        .mockImplementation(async (note: Note): Promise<Note> => note);
      const note = await service.createNote(content);
      const revisions = await note.revisions;
      revisions[0].authorships = [
        {
          user: user,
          revisions: revisions,
          startPos: 0,
          endPos: 1,
        } as Authorship,
      ];
      revisions[0].createdAt = new Date(1549312452000);
      jest.spyOn(revisionRepo, 'findOne').mockResolvedValue(revisions[0]);
      note.id = 'testId';
      note.alias = 'testAlias';
      note.title = 'testTitle';
      note.description = 'testDescription';
      note.authorColors = [
        {
          note: note,
          user: user,
          color: 'red',
        } as AuthorColor,
      ];
      note.owner = user;
      note.userPermissions = [
        {
          note: note,
          user: user,
          canEdit: true,
        },
      ];
      note.groupPermissions = [
        {
          note: note,
          group: group,
          canEdit: true,
        },
      ];
      note.tags = [
        {
          id: 1,
          name: 'testTag',
          notes: [note],
        },
      ];
      note.viewcount = 1337;
      const metadataDto = await service.toNoteMetadataDto(note);
      expect(metadataDto.id).toEqual(note.id);
      expect(metadataDto.alias).toEqual(note.alias);
      expect(metadataDto.title).toEqual(note.title);
      expect(metadataDto.createTime).toEqual(revisions[0].createdAt);
      expect(metadataDto.description).toEqual(note.description);
      expect(metadataDto.editedBy).toHaveLength(1);
      expect(metadataDto.editedBy[0]).toEqual(user.userName);
      expect(metadataDto.id).toEqual(note.id);
      expect(metadataDto.permissions.owner.userName).toEqual(user.userName);
      expect(metadataDto.permissions.sharedToUsers).toHaveLength(1);
      expect(metadataDto.permissions.sharedToUsers[0].user.userName).toEqual(
        user.userName,
      );
      expect(metadataDto.permissions.sharedToUsers[0].canEdit).toEqual(true);
      expect(metadataDto.permissions.sharedToGroups).toHaveLength(1);
      expect(
        metadataDto.permissions.sharedToGroups[0].group.displayName,
      ).toEqual(group.displayName);
      expect(metadataDto.permissions.sharedToGroups[0].canEdit).toEqual(true);
      expect(metadataDto.tags).toHaveLength(1);
      expect(metadataDto.tags[0]).toEqual(note.tags[0].name);
      expect(metadataDto.updateTime).toEqual(revisions[0].createdAt);
      expect(metadataDto.updateUser.userName).toEqual(user.userName);
      expect(metadataDto.viewCount).toEqual(note.viewcount);
    });
  });
});
