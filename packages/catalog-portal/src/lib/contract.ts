import { z } from 'zod';
import { CatalogItem } from '@matvis/shared';

type SchemaNode = {
	type?: string;
	description?: string;
	enum?: unknown[];
	items?: SchemaNode;
	properties?: Record< string, SchemaNode >;
	required?: string[];
	$ref?: string;
};

export type ModelField = {
	name: string;
	type: string;
	required: boolean;
	note: string;
	/**
	 * The named block this field expands to, when it has one. Present so the
	 * page can render the relationship rather than leave the reader to match a
	 * type name against a section further down.
	 */
	fields?: ModelField[];
};

export type Model = { name: string; fields: ModelField[] };

function refName( node: SchemaNode ): string | null {
	if ( node.$ref ) {
		return node.$ref.slice( node.$ref.lastIndexOf( '/' ) + 1 );
	}
	if ( node.type === 'array' && node.items ) {
		return refName( node.items );
	}
	return null;
}

function schemaType( node: SchemaNode ): string {
	if ( node.$ref ) {
		return node.$ref.slice( node.$ref.lastIndexOf( '/' ) + 1 );
	}
	if ( node.enum ) {
		return node.enum
			.map( ( value ) => JSON.stringify( value ) )
			.join( ' | ' );
	}
	if ( node.type === 'array' && node.items ) {
		return `${ schemaType( node.items ) }[]`;
	}
	return node.type ?? 'unknown';
}

/**
 * `$defs` by name. `schemaType` already resolves a `$ref` to its name, this is
 * what turns that name back into the block it points at, which is the link the
 * flat rendering used to throw away.
 */
type Defs = Record< string, SchemaNode >;

function fieldsFrom(
	node: SchemaNode,
	defs: Defs,
	seen: string[]
): ModelField[] {
	const required = new Set( node.required ?? [] );
	return Object.entries( node.properties ?? {} ).map(
		( [ field, property ] ) => {
			const ref = refName( property );
			const target = ref ? defs[ ref ] : undefined;
			// A self-referential contract would recurse forever, so a name already on
			// the path renders as its type alone. Nothing in the catalog does this
			// today, the guard is cheaper than finding out the hard way.
			const expandable = target && ! seen.includes( ref! );

			return {
				name: field,
				type: schemaType( property ),
				required: required.has( field ),
				note: property.description ?? '',
				...( expandable
					? { fields: fieldsFrom( target, defs, [ ...seen, ref! ] ) }
					: {} ),
			};
		}
	);
}

const catalogItemSchema = z.toJSONSchema( CatalogItem ) as SchemaNode & {
	$defs?: Defs;
};

/**
 * One root, nested. `CatalogFood`, `CatalogNutrition` and `CatalogQuantity`
 * live inside the fields that carry them rather than as sibling sections, so
 * the shape on the page is the shape in the payload.
 */
export const MODELS: Model[] = [
	{
		name: 'CatalogItem',
		fields: fieldsFrom( catalogItemSchema, catalogItemSchema.$defs ?? {}, [
			'CatalogItem',
		] ),
	},
];
