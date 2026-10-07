-- Preserve tenant-safe category hierarchy semantics on delete.
create or replace function bravoshop_delete_category(p_category_id uuid,p_store_id uuid)
returns boolean language plpgsql as $$
declare deleted boolean:=false;
begin
 update categories
 set parent_id=null
 where parent_id=p_category_id and store_id=p_store_id;

 delete from categories
 where id=p_category_id and store_id=p_store_id;
 deleted:=found;
 return deleted;
end $$;
