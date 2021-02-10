/*
 * SPDX-FileCopyrightText: 2021 The HedgeDoc developers (see AUTHORS file)
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NotInDBError extends Error {
  name = 'NotInDBError';
}

export class ClientError extends Error {
  name = 'ClientError';
}

export class PermissionError extends Error {
  name = 'PermissionError';
}

export class TokenNotValidError extends Error {
  name = 'TokenNotValidError';
}

export class TooManyTokensError extends Error {
  name = 'TooManyTokensError';
}

export class PermissionsUpdateInconsistent extends Error {
  name = 'PermissionsUpdateInconsistent';
}
