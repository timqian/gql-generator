import { gql } from '@apollo/client';
export const QUERY = gql`query listPages($bookId: Float!){
    listPages(bookId: $bookId){
        bookId
        createdTime
        pageElement{
            bookId
            createdTime
            lSize{
                height
                width
            }
            hSize{
                height
                width
            }
            pageIndex
            updatedTime
        }
        pageIndex
        pageName
        updatedTime
    }
}`