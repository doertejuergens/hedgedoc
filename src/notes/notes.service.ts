/*
 * SPDX-FileCopyrightText: 2021 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotInDBError, PermissionsUpdateInconsistent } from '../errors/errors';
import { ConsoleLoggerService } from '../logger/console-logger.service';
import { Revision } from '../revisions/revision.entity';
import { RevisionsService } from '../revisions/revisions.service';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { NoteMetadataDto } from './note-metadata.dto';
import {
  NotePermissionsDto,
  NotePermissionsUpdateDto,
} from './note-permissions.dto';
import { NoteDto } from './note.dto';
import { Note } from './note.entity';
import { Tag } from './tag.entity';
import { HistoryEntry } from '../history/history-entry.entity';
import { NoteUserPermission } from '../permissions/note-user-permission.entity';
import { NoteGroupPermission } from '../permissions/note-group-permission.entity';

@Injectable()
export class NotesService {
  constructor(
    private readonly logger: ConsoleLoggerService,
    @InjectRepository(Note) private noteRepository: Repository<Note>,
    @InjectRepository(Tag) private tagRepository: Repository<Tag>,
    @Inject(UsersService) private usersService: UsersService,
    @Inject(forwardRef(() => RevisionsService))
    private revisionsService: RevisionsService,
  ) {
    this.logger.setContext(NotesService.name);
  }

  async getUserNotes(user: User): Promise<Note[]> {
    const notes = await this.noteRepository.find({
      where: { owner: user },
      relations: [
        'owner',
        'userPermissions',
        'groupPermissions',
        'authorColors',
        'tags',
      ],
    });
    if (notes === undefined) {
      return [];
    }
    return notes;
  }

  async createNote(
    noteContent: string,
    alias?: NoteMetadataDto['alias'],
    owner?: User,
  ): Promise<Note> {
    const newNote = Note.create();
    newNote.revisions = Promise.resolve([
      //TODO: Calculate patch
      Revision.create(noteContent, noteContent),
    ]);
    if (alias) {
      newNote.alias = alias;
    }
    if (owner) {
      newNote.historyEntries = [HistoryEntry.create(owner)];
      newNote.owner = owner;
    }
    return this.noteRepository.save(newNote);
  }

  async getNoteContentByNote(note: Note): Promise<string> {
    return (await this.getLatestRevision(note)).content;
  }

  async getLatestRevision(note: Note): Promise<Revision> {
    return this.revisionsService.getLatestRevision(note.id);
  }

  async getFirstRevision(note: Note): Promise<Revision> {
    return this.revisionsService.getFirstRevision(note.id);
  }

  async getNoteByIdOrAlias(noteIdOrAlias: string): Promise<Note> {
    this.logger.debug(
      `Trying to find note '${noteIdOrAlias}'`,
      'getNoteByIdOrAlias',
    );
    const note = await this.noteRepository.findOne({
      where: [
        {
          id: noteIdOrAlias,
        },
        {
          alias: noteIdOrAlias,
        },
      ],
      relations: [
        'authorColors',
        'owner',
        'groupPermissions',
        'userPermissions',
        'tags',
      ],
    });
    if (note === undefined) {
      this.logger.debug(
        `Could not find note '${noteIdOrAlias}'`,
        'getNoteByIdOrAlias',
      );
      throw new NotInDBError(
        `Note with id/alias '${noteIdOrAlias}' not found.`,
      );
    }
    this.logger.debug(`Found note '${noteIdOrAlias}'`, 'getNoteByIdOrAlias');
    return note;
  }

  async deleteNoteByIdOrAlias(noteIdOrAlias: string) {
    const note = await this.getNoteByIdOrAlias(noteIdOrAlias);
    return await this.noteRepository.remove(note);
  }

  async updateNoteByIdOrAlias(
    noteIdOrAlias: string,
    noteContent: string,
  ): Promise<Note> {
    const note = await this.getNoteByIdOrAlias(noteIdOrAlias);
    const revisions = await note.revisions;
    //TODO: Calculate patch
    revisions.push(Revision.create(noteContent, noteContent));
    note.revisions = Promise.resolve(revisions);
    return this.noteRepository.save(note);
  }

  async updateNotePermissions(
    noteIdOrAlias: string,
    newPermissions: NotePermissionsUpdateDto,
  ): Promise<Note> {
    const note = await this.getNoteByIdOrAlias(noteIdOrAlias);

    const users = newPermissions.sharedToUsers.map(
      (userPermission) => userPermission.username,
    );
    const distinctUser = [...new Set(users)];

    const groups = newPermissions.sharedToGroups.map(
      (groupPermission) => groupPermission.groupname,
    );
    const distinctGroups = [...new Set(groups)];

    if (
      distinctUser.length !== users.length ||
      distinctGroups.length !== groups.length
    ) {
      throw new PermissionsUpdateInconsistent(
        'The PermissionUpdate you requested specifies the same user or group multiple times.',
      );
    }

    // Update or create userPermissions
    for (const newUserPermission of newPermissions.sharedToUsers) {
      const foundPermission = note.userPermissions.find(
        (userPermission) =>
          userPermission.user.userName === newUserPermission.username,
      );
      if (foundPermission) {
        foundPermission.canEdit = newUserPermission.canEdit;
      } else {
        const user = await this.usersService.getUserByUsername(
          newUserPermission.username,
        );
        const createdPermission = NoteUserPermission.create(
          user,
          newUserPermission.canEdit,
        );
        note.userPermissions.push(createdPermission);
      }
    }

    // Update or create groupPermissions
    for (const newGroupPermission of newPermissions.sharedToGroups) {
      const foundPermission = note.groupPermissions.find(
        (groupPermission) =>
          groupPermission.group.displayName === newGroupPermission.groupname,
      );
      if (foundPermission) {
        foundPermission.canEdit = newGroupPermission.canEdit;
      } else {
        // ToDo: Get group
        /*const user = await this.usersService.getUserByUsername(
          newGroupPermission.username,
        );*/
        const createdPermission = NoteGroupPermission.create(
          undefined,
          newGroupPermission.canEdit,
        );
        note.groupPermissions.push(createdPermission);
      }
    }

    if (newPermissions.sharedToUsers.length === 0) {
      note.userPermissions = [];
    }

    if (newPermissions.sharedToGroups.length === 0) {
      note.groupPermissions = [];
    }

    return await this.noteRepository.save(note);
  }

  async getNoteContentByIdOrAlias(noteIdOrAlias: string): Promise<string> {
    const note = await this.getNoteByIdOrAlias(noteIdOrAlias);
    return this.getNoteContentByNote(note);
  }

  toTagList(note: Note): string[] {
    return note.tags.map((tag) => tag.name);
  }

  async toNotePermissionsDto(note: Note): Promise<NotePermissionsDto> {
    return {
      owner: this.usersService.toUserDto(note.owner),
      sharedToUsers: note.userPermissions.map((noteUserPermission) => ({
        user: this.usersService.toUserDto(noteUserPermission.user),
        canEdit: noteUserPermission.canEdit,
      })),
      sharedToGroups: note.groupPermissions.map((noteGroupPermission) => ({
        group: noteGroupPermission.group,
        canEdit: noteGroupPermission.canEdit,
      })),
    };
  }

  async toNoteMetadataDto(note: Note): Promise<NoteMetadataDto> {
    // Sort the AuthorShip's by their updatedAt Date to get the latest one
    // the user of that AuthorShip shall be the updateUser
    const lastRevision = await this.getLatestRevision(note);
    const updateUser = lastRevision.authorships.sort(
      (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
    )[0].user;
    return {
      // TODO: Convert DB UUID to base64
      id: note.id,
      alias: note.alias,
      title: note.title,
      createTime: (await this.getFirstRevision(note)).createdAt,
      description: note.description,
      editedBy: note.authorColors.map(
        (authorColor) => authorColor.user.userName,
      ),
      permissions: await this.toNotePermissionsDto(note),
      tags: this.toTagList(note),
      updateTime: (await this.getLatestRevision(note)).createdAt,
      updateUser: this.usersService.toUserDto(updateUser),
      viewCount: note.viewcount,
    };
  }

  async toNoteDto(note: Note): Promise<NoteDto> {
    return {
      content: await this.getNoteContentByNote(note),
      metadata: await this.toNoteMetadataDto(note),
      editedByAtPosition: [],
    };
  }
}
