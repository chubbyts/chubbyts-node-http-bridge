import type { IncomingMessage, ServerResponse } from 'http';
import type { Method, Response, ServerRequest } from '@chubbyts/chubbyts-http-types/dist/message';
import type {
  ServerRequestFactory,
  StreamFromResourceFactory,
  UriFactory,
} from '@chubbyts/chubbyts-http-types/dist/message-factory';

type UriOptions =
  | {
      schema?: 'http' | 'https';
      host?: string;
    }
  | 'forwarded';

const getUri = (req: IncomingMessage, uriOptions: UriOptions): string => {
  if (!req.url) {
    throw new Error('Url missing');
  }

  if (uriOptions === 'forwarded') {
    const headers = Object.fromEntries(
      ['x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-port'].map((name) => [name, req.headers[name]]),
    );

    const missingHeaders = Object.keys(headers).filter((name) => !headers[name]);

    if (missingHeaders.length) {
      throw new Error(`Missing "${missingHeaders.join('", "')}" header(s).`);
    }

    const { 'x-forwarded-proto': schema, 'x-forwarded-host': host, 'x-forwarded-port': port } = headers;

    return `${schema}://${host}:${port}${req.url}`;
  }

  const schema = uriOptions.schema ?? 'http';
  const host = uriOptions.host ?? req.headers.host ?? 'localhost';

  return schema + '://' + host + req.url;
};

const normalizeHeader = (header: string | undefined): Array<string> => {
  if (undefined === header) {
    return [];
  }

  return header.split(',').map((headerPart) => headerPart.trim());
};

const normalizeHeaders = (headers: Array<string> | string | undefined): Array<string> => {
  if (Array.isArray(headers)) {
    return headers.flatMap(normalizeHeader);
  }

  return normalizeHeader(headers);
};

type NodeToServerRequestFactory = (req: IncomingMessage) => ServerRequest;

export const createNodeToServerRequestFactory = (
  uriFactory: UriFactory,
  serverRequestFactory: ServerRequestFactory,
  streamFromResourceFactory: StreamFromResourceFactory,
  uriOptions: UriOptions = {},
): NodeToServerRequestFactory => {
  return (req: IncomingMessage): ServerRequest => {
    if (!req.method) {
      throw new Error('Method missing');
    }

    const uri = uriFactory(getUri(req, uriOptions));

    const headers = Object.fromEntries(
      Object.entries(req.headers)
        .map(([name, value]) => [name, normalizeHeaders(value)])
        .filter(([_, value]) => value.length),
    );

    return {
      ...serverRequestFactory(req.method.toUpperCase() as Method, uri),
      protocolVersion: req.httpVersion,
      body: streamFromResourceFactory(req),
      headers,
    };
  };
};

type ResponseToNodeEmitter = (response: Response, res: ServerResponse) => void;

export const createResponseToNodeEmitter = (): ResponseToNodeEmitter => {
  return (response: Response, res: ServerResponse): void => {
    res.writeHead(response.status, response.reasonPhrase, response.headers);
    response.body.pipe(res);
  };
};
