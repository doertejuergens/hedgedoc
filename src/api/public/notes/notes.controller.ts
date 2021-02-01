/*
 * SPDX-FileCopyrightText: 2021 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { NotInDBError } from '../../../errors/errors';
import { ConsoleLoggerService } from '../../../logger/console-logger.service';
import {
  NotePermissionsDto,
  NotePermissionsUpdateDto,
} from '../../../notes/note-permissions.dto';
import { NotesService } from '../../../notes/notes.service';
import { RevisionsService } from '../../../revisions/revisions.service';
import { MarkdownBody } from '../../utils/markdownbody-decorator';
import { TokenAuthGuard } from '../../../auth/token-auth.guard';
import { ApiSecurity } from '@nestjs/swagger';
import { NoteDto } from '../../../notes/note.dto';
import { NoteMetadataDto } from '../../../notes/note-metadata.dto';
import { RevisionMetadataDto } from '../../../revisions/revision-metadata.dto';
import { RevisionDto } from '../../../revisions/revision.dto';
import { PermissionsService } from '../../../permissions/permissions.service';

@ApiSecurity('token')
@Controller('notes')
export class NotesController {
  constructor(
    private readonly logger: ConsoleLoggerService,
    private noteService: NotesService,
    private revisionsService: RevisionsService,
    private permissionsService: PermissionsService,
  ) {
    this.logger.setContext(NotesController.name);
  }

  @UseGuards(TokenAuthGuard)
  @Post()
  async createNote(
    @Request() req,
    @MarkdownBody() text: string,
  ): Promise<NoteDto> {
    // ToDo: provide user for createNoteDto
    if (!this.permissionsService.mayCreate(req.user)) {
      throw new UnauthorizedException('Creation denied!');
    }
    this.logger.debug('Got raw markdown:\n' + text);
    return this.noteService.toNoteDto(
      await this.noteService.createNote(text, '', req.user),
    );
  }

  @UseGuards(TokenAuthGuard)
  @Get(':noteIdOrAlias')
  async getNote(
    @Request() req,
    @Param('noteIdOrAlias') noteIdOrAlias: string,
  ): Promise<NoteDto> {
    const note = await this.noteService.getNoteByIdOrAlias(noteIdOrAlias);
    if (!this.permissionsService.mayRead(req.user, note)) {
      throw new UnauthorizedException('Read denied!');
    }
    // ToDo: check if user is allowed to view this note
    try {
      return this.noteService.toNoteDto(note);
    } catch (e) {
      if (e instanceof NotInDBError) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }

  @UseGuards(TokenAuthGuard)
  @Post(':noteAlias')
  async createNamedNote(
    @Request() req,
    @Param('noteAlias') noteAlias: string,
    @MarkdownBody() text: string,
  ): Promise<NoteDto> {
    if (!this.permissionsService.mayCreate(req.user)) {
      throw new UnauthorizedException('Create denied!');
    }
    this.logger.debug('Got raw markdown:\n' + text);
    return this.noteService.toNoteDto(
      await this.noteService.createNote(text, noteAlias, req.user),
    );
  }

  @UseGuards(TokenAuthGuard)
  @Delete(':noteIdOrAlias')
  async deleteNote(
    @Request() req,
    @Param('noteIdOrAlias') noteIdOrAlias: string,
  ): Promise<void> {
    const note = await this.noteService.getNoteByIdOrAlias(noteIdOrAlias);
    if (!this.permissionsService.isOwner(req.user, note)) {
      throw new UnauthorizedException('Delete denied!');
    }
    this.logger.debug('Deleting note: ' + noteIdOrAlias);
    try {
      await this.noteService.deleteNoteByIdOrAlias(noteIdOrAlias);
    } catch (e) {
      if (e instanceof NotInDBError) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
    this.logger.debug('Successfully deleted ' + noteIdOrAlias);
    return;
  }

  @UseGuards(TokenAuthGuard)
  @Put(':noteIdOrAlias')
  async updateNote(
    @Request() req,
    @Param('noteIdOrAlias') noteIdOrAlias: string,
    @MarkdownBody() text: string,
  ): Promise<NoteDto> {
    // ToDo: check if user is allowed to change this note
    const note = await this.noteService.getNoteByIdOrAlias(noteIdOrAlias);
    if (!this.permissionsService.mayWrite(req.user, note)) {
      throw new UnauthorizedException('Update denied!');
    }
    this.logger.debug('Got raw markdown:\n' + text);
    try {
      return this.noteService.toNoteDto(
        await this.noteService.updateNoteByIdOrAlias(noteIdOrAlias, text),
      );
    } catch (e) {
      if (e instanceof NotInDBError) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }

  @UseGuards(TokenAuthGuard)
  @Get(':noteIdOrAlias/content')
  @Header('content-type', 'text/markdown')
  async getNoteContent(
    @Request() req,
    @Param('noteIdOrAlias') noteIdOrAlias: string,
  ): Promise<string> {
    const note = await this.noteService.getNoteByIdOrAlias(noteIdOrAlias);
    if (!this.permissionsService.mayRead(req.user, note)) {
      throw new UnauthorizedException('Read denied!');
    }
    try {
      return await this.noteService.getNoteContent(noteIdOrAlias);
    } catch (e) {
      if (e instanceof NotInDBError) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }

  @UseGuards(TokenAuthGuard)
  @Get(':noteIdOrAlias/metadata')
  async getNoteMetadata(
    @Request() req,
    @Param('noteIdOrAlias') noteIdOrAlias: string,
  ): Promise<NoteMetadataDto> {
    const note = await this.noteService.getNoteByIdOrAlias(noteIdOrAlias);
    if (!this.permissionsService.mayRead(req.user, note)) {
      throw new UnauthorizedException('Read denied!');
    }
    try {
      return this.noteService.toNoteMetadataDto(
        await this.noteService.getNoteByIdOrAlias(noteIdOrAlias),
      );
    } catch (e) {
      if (e instanceof NotInDBError) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }

  @UseGuards(TokenAuthGuard)
  @Put(':noteIdOrAlias/metadata/permissions')
  async updateNotePermissions(
    @Request() req,
    @Param('noteIdOrAlias') noteIdOrAlias: string,
    @Body() updateDto: NotePermissionsUpdateDto,
  ): Promise<NotePermissionsDto> {
    // ToDo: check if user is allowed to view this notes permissions
    const note = await this.noteService.getNoteByIdOrAlias(noteIdOrAlias);
    if (!this.permissionsService.isOwner(req.user, note)) {
      throw new UnauthorizedException('Update denied!');
    }
    try {
      return this.noteService.toNotePermissionsDto(
        await this.noteService.updateNotePermissions(noteIdOrAlias, updateDto),
      );
    } catch (e) {
      if (e instanceof NotInDBError) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }

  @UseGuards(TokenAuthGuard)
  @Get(':noteIdOrAlias/revisions')
  async getNoteRevisions(
    @Request() req,
    @Param('noteIdOrAlias') noteIdOrAlias: string,
  ): Promise<RevisionMetadataDto[]> {
    const note = await this.noteService.getNoteByIdOrAlias(noteIdOrAlias);
    if (!this.permissionsService.mayRead(req.user, note)) {
      throw new UnauthorizedException('Raec denied!');
    }
    try {
      const revisions = await this.revisionsService.getAllRevisions(
        noteIdOrAlias,
      );
      return Promise.all(
        revisions.map((revision) =>
          this.revisionsService.toRevisionMetadataDto(revision),
        ),
      );
    } catch (e) {
      if (e instanceof NotInDBError) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }

  @UseGuards(TokenAuthGuard)
  @Get(':noteIdOrAlias/revisions/:revisionId')
  async getNoteRevision(
    @Request() req,
    @Param('noteIdOrAlias') noteIdOrAlias: string,
    @Param('revisionId') revisionId: number,
  ): Promise<RevisionDto> {
    const note = await this.noteService.getNoteByIdOrAlias(noteIdOrAlias);
    if (!this.permissionsService.mayRead(req.user, note)) {
      throw new UnauthorizedException('Read denied!');
    }
    try {
      return this.revisionsService.toRevisionDto(
        await this.revisionsService.getRevision(noteIdOrAlias, revisionId),
      );
    } catch (e) {
      if (e instanceof NotInDBError) {
        throw new NotFoundException(e.message);
      }
      throw e;
    }
  }
}
